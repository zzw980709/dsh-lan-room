/**
 * 房间协议实现：Host 服务端 + Guest 客户端。
 *
 * 传输：HTTP（`/join` 明文握手 + `/events` SSE 下行 + `/rpc` 上行），
 * 握手之后每一帧都用该 peer 独立派生出的 AES-256-GCM 密钥加密，
 * 帧序号单调递增并作为 AAD 绑定，防窃听、防篡改、防重放。
 *
 * 不引入任何第三方依赖：node:http + node:crypto + 全局 fetch。
 */
import http from 'node:http'
import os from 'node:os'
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

export const PROTO = 1
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LEN = 8
const ID_LEN = 2
const MAX_BODY = 1 << 20
const MAX_MESSAGES = 100
const MAX_ASKS = 100
const MEMBER_LIMIT = 8
const HEARTBEAT_MS = 20_000

/* ────────────────────────── 邀请码 ────────────────────────── */

export function randomCode(len = CODE_LEN) {
    const bytes = randomBytes(len)
    let out = ''
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32]
    return out
}

/** 归一化用户输入：大写、去掉分隔符、Crockford 易混字符映射。 */
export function normalizeCode(input) {
    return String(input ?? '')
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1')
        .replace(/U/g, 'V')
}

export function parseCode(input) {
    const code = normalizeCode(input)
    if (code.length !== CODE_LEN) return null
    const inviteId = code.slice(0, ID_LEN)
    const secret = code.slice(ID_LEN)
    return { code, inviteId, secret, key: deriveKey(secret, inviteId) }
}

function deriveKey(secret, inviteId) {
    return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from(`lan-room|${inviteId}`), Buffer.from('lan-room/v1'), 32))
}

export function makeProof(key, inviteId, peerName, nonce) {
    return createHmac('sha256', key).update(`${inviteId}|${peerName}|${nonce}`).digest('hex')
}

function safeEqual(a, b) {
    const x = Buffer.from(String(a))
    const y = Buffer.from(String(b))
    return x.length === y.length && timingSafeEqual(x, y)
}

/* ────────────────────────── 帧加解密 ────────────────────────── */

export function seal(key, seq, value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(String(seq)))
    const body = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()])
    return {
        v: 1,
        seq,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ct: body.toString('base64'),
    }
}

export function unseal(key, envelope) {
    if (!envelope || envelope.v !== 1) throw new Error('bad envelope')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
    decipher.setAAD(Buffer.from(String(envelope.seq)))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()])
    return JSON.parse(plain.toString('utf8'))
}

/* ────────────────────────── HTTP 小工具 ────────────────────────── */

export function json(res, status, value) {
    const body = JSON.stringify(value)
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
    })
    res.end(body)
}

export function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_BODY) {
                reject(new Error('body too large'))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => {
            if (chunks.length === 0) return resolve({})
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch (error) {
                reject(error)
            }
        })
        req.on('error', reject)
    })
}

export function lanAddress() {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const info of interfaces[name] ?? []) {
            if (info.family === 'IPv4' && !info.internal) return info.address
        }
    }
    return '127.0.0.1'
}

export function platformName() {
    if (process.platform === 'darwin') return 'macOS'
    if (process.platform === 'win32') return 'Windows'
    return 'Linux'
}

export function hostName() {
    return os.hostname().replace(/\.local$/, '')
}

/* ────────────────────────── Host ────────────────────────── */

export class RoomHost {
    constructor({ log = () => {} } = {}) {
        this.log = log
        this.role = 'host'
        this.roomId = null
        this.title = ''
        this.hostName = hostName()
        this.createdAt = 0
        this.expiresAt = 0
        this.memberLimit = MEMBER_LIMIT
        this.port = 0
        this.address = ''
        this.server = null
        this.peers = new Map()
        this.invites = new Map()
        this.messages = []
        this.asks = []
        this.pending = new Map()
        this.listeners = new Set()
        this.onAsk = null
        this.seqSeed = 0
    }

    onChange(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit() {
        for (const listener of this.listeners) {
            try {
                listener()
            } catch {
                /* UI listeners must not break the room */
            }
        }
    }

    get running() {
        return this.role === 'host' && this.server !== null && Date.now() < this.expiresAt
    }

    async start({ title, displayName, port = 8787, ttlMinutes = 480 } = {}) {
        if (this.running) return this.snapshot()
        this.title = String(title || '我的房间').slice(0, 40)
        if (displayName) this.hostName = String(displayName).slice(0, 30)
        this.roomId = randomCode(8)
        this.createdAt = Date.now()
        this.expiresAt = this.createdAt + Math.max(5, Number(ttlMinutes) || 480) * 60_000
        this.peers.set('host', {
            peerId: 'host',
            name: this.hostName,
            platform: platformName(),
            status: 'online',
            isHost: true,
            joinedAt: this.createdAt,
            lastSeen: this.createdAt,
            sse: null,
        })

        const started = await this.listen(Number(port) || 8787)
        this.port = started.port
        this.address = `${lanAddress()}:${this.port}`
        this.pushMessage({ kind: 'system', from: 'host', to: 'all', text: `房间已创建，监听 ${this.address}` })
        this.emit()
        return this.snapshot()
    }

    async listen(preferred) {
        let port = Number(preferred) || 8787
        for (let attempt = 0; attempt < 30; attempt += 1) {
            const server = await this.bind(port)
            if (!server) {
                port += 1
                continue
            }
            // macOS 允许 0.0.0.0 与 127.0.0.1 同时绑定：真被占用时我们的监听仍然成功，
            // 只是回环流量会被更具体的那个 socket 抢走。绑定后自检一次，不是自己就让位。
            const owned = await this.probe(port)
            if (owned) {
                this.server = server
                return { port }
            }
            await new Promise((resolve) => server.close(resolve))
            port += 1
        }
        throw new Error('port-unavailable')
    }

    bind(port) {
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                this.handleHttp(req, res).catch((error) => {
                    this.log('request failed', error)
                    if (!res.headersSent) json(res, 500, { error: 'internal' })
                    else res.end()
                })
            })
            server.once('error', () => resolve(null))
            server.listen(port, '0.0.0.0', () => resolve(server))
        })
    }

    async probe(port) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`, {
                signal: AbortSignal.timeout(800),
            })
            if (!response.ok) return false
            const body = await response.json()
            return body?.ok === true && body?.proto === PROTO
        } catch {
            // 自检失败通常说明这个端口根本没落到本进程，换下一个。
            return false
        }
    }

    stop(reason = 'host-closed') {
        if (this.server) {
            this.broadcast('room-closed', { reason })
            for (const peer of this.peers.values()) {
                if (peer.sse) {
                    try {
                        peer.sse.end()
                    } catch {
                        /* already closed */
                    }
                }
            }
            this.server.close()
            this.server = null
        }
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.resolve({ status: 'error', text: '房间已关闭', meta: { reason } })
        }
        this.pending.clear()
        this.peers.clear()
        this.invites.clear()
        this.role = 'idle'
        this.roomId = null
        this.emit()
    }

    addInvite({ ttlMinutes = 24 * 60 } = {}) {
        const inviteId = randomCode(ID_LEN)
        if (this.invites.has(inviteId)) return this.addInvite({ ttlMinutes })
        const secret = randomCode(CODE_LEN - ID_LEN)
        const invite = {
            inviteId,
            secret,
            code: inviteId + secret,
            key: deriveKey(secret, inviteId),
            status: 'unused',
            expiresAt: Date.now() + Math.max(5, Number(ttlMinutes) || 1440) * 60_000,
            createdAt: Date.now(),
            usedBy: null,
            usedAt: null,
        }
        this.invites.set(inviteId, invite)
        this.emit()
        return this.inviteView(invite)
    }

    revokeInvite(inviteId) {
        const invite = this.invites.get(String(inviteId))
        if (!invite) return false
        invite.status = 'revoked'
        this.emit()
        return true
    }

    inviteView(invite) {
        return {
            inviteId: invite.inviteId,
            code: invite.code,
            status: invite.status,
            expiresAt: invite.expiresAt,
            usedBy: invite.usedBy,
            usedAt: invite.usedAt,
        }
    }

    memberViews() {
        return [...this.peers.values()].map((peer) => ({
            peerId: peer.peerId,
            name: peer.name,
            platform: peer.platform,
            status: peer.sse || peer.isHost ? peer.status : 'offline',
            isHost: Boolean(peer.isHost),
            isSelf: peer.peerId === 'host',
            joinedAt: peer.joinedAt,
            lastSeen: peer.lastSeen,
        }))
    }

    snapshot() {
        return {
            role: this.role,
            self: { peerId: 'host', name: this.hostName, platform: platformName() },
            room: this.running
                ? {
                      id: this.roomId,
                      title: this.title,
                      address: this.address,
                      port: this.port,
                      createdAt: this.createdAt,
                      expiresAt: this.expiresAt,
                      memberLimit: this.memberLimit,
                      hostName: this.hostName,
                      status: 'running',
                  }
                : null,
            members: this.memberViews(),
            invites: [...this.invites.values()].map((invite) => this.inviteView(invite)).sort((a, b) => a.expiresAt - b.expiresAt),
            messages: this.messages,
            asks: this.asks,
        }
    }

    pushMessage(message) {
        const record = {
            id: message.id || `m_${++this.seqSeed}`,
            kind: message.kind || 'chat',
            from: message.from || 'host',
            to: message.to || 'all',
            text: String(message.text ?? '').slice(0, 8000),
            ts: message.ts || Date.now(),
        }
        this.messages.push(record)
        if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES)
        this.emit()
        return record
    }

    recordAsk({ id, from, to, text }) {
        const ask = { id, from, to, text, status: 'pending', createdAt: Date.now(), answeredAt: null, answer: null, meta: null }
        this.asks.push(ask)
        if (this.asks.length > MAX_ASKS) this.asks.splice(0, this.asks.length - MAX_ASKS)
        this.emit()
        return ask
    }

    settleAsk(id, patch) {
        const ask = this.asks.find((item) => item.id === id)
        if (!ask) return
        Object.assign(ask, patch, { answeredAt: Date.now() })
        this.emit()
    }

    /* ── HTTP 入口 ── */

    async handleHttp(req, res) {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'local'}`)
        if (url.pathname === '/join' && req.method === 'POST') return this.handleJoin(req, res)
        if (url.pathname === '/events' && req.method === 'GET') return this.handleEvents(req, res)
        if (url.pathname === '/rpc' && req.method === 'POST') return this.handleRpc(req, res)
        if (url.pathname === '/health' && req.method === 'GET') {
            return json(res, 200, { ok: true, room: this.running ? this.roomId : null, proto: PROTO })
        }
        json(res, 404, { error: 'not-found' })
    }

    async handleJoin(req, res) {
        if (!this.running) return json(res, 503, { error: 'room-closed' })
        let body
        try {
            body = await readBody(req)
        } catch {
            return json(res, 400, { error: 'bad-request' })
        }
        const { inviteId, peerName, nonce, proof } = body
        const invite = this.invites.get(String(inviteId || ''))
        if (!invite) return json(res, 404, { error: 'invite-unknown' })
        if (invite.status === 'used') return json(res, 409, { error: 'invite-used' })
        if (invite.status === 'revoked') return json(res, 410, { error: 'invite-revoked' })
        if (invite.status === 'expired' || Date.now() > invite.expiresAt) {
            invite.status = 'expired'
            return json(res, 410, { error: 'invite-expired' })
        }
        if (this.peers.size > this.memberLimit) return json(res, 409, { error: 'room-full' })
        const expected = makeProof(invite.key, invite.inviteId, String(peerName || ''), String(nonce || ''))
        if (!safeEqual(expected, proof)) return json(res, 403, { error: 'proof-invalid' })

        invite.status = 'used'
        invite.usedBy = String(peerName || 'guest').slice(0, 30)
        invite.usedAt = Date.now()

        const peer = {
            peerId: `p_${randomCode(6).toLowerCase()}`,
            name: invite.usedBy,
            platform: String(body.platform || 'unknown').slice(0, 20),
            status: 'online',
            isHost: false,
            joinedAt: Date.now(),
            lastSeen: Date.now(),
            token: randomBytes(32).toString('hex'),
            key: invite.key,
            outSeq: 0,
            inSeq: 0,
            sse: null,
        }
        this.peers.set(peer.peerId, peer)
        this.pushMessage({ kind: 'system', from: 'host', to: 'all', text: `${peer.name} 加入了房间` })
        this.broadcast('presence', { peerId: peer.peerId, name: peer.name, status: 'online' }, peer.peerId)
        this.emit()

        const welcome = seal(peer.key, 0, {
            type: 'welcome',
            peerId: peer.peerId,
            token: peer.token,
            proto: PROTO,
            room: {
                id: this.roomId,
                title: this.title,
                address: this.address,
                memberLimit: this.memberLimit,
                hostName: this.hostName,
                expiresAt: this.expiresAt,
            },
            members: this.memberViews(),
        })
        json(res, 200, welcome)
    }

    peerByToken(req) {
        const header = String(req.headers.authorization || '')
        const headerToken = header.startsWith('Bearer ') ? header.slice(7) : ''
        const url = new URL(req.url || '/', 'http://local')
        const token = headerToken || url.searchParams.get('token') || ''
        if (!token) return undefined
        for (const peer of this.peers.values()) {
            if (!peer.isHost && peer.token === token) return peer
        }
        return undefined
    }

    handleEvents(req, res) {
        const peer = this.peerByToken(req)
        if (!peer) {
            res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('unauthorized')
            return
        }
        res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        })
        res.write(': connected\n\n')
        peer.sse = res
        peer.status = 'online'
        peer.lastSeen = Date.now()
        this.broadcast('presence', { peerId: peer.peerId, name: peer.name, status: 'online' }, peer.peerId)
        this.emit()

        const heartbeat = setInterval(() => {
            try {
                res.write(': ping\n\n')
            } catch {
                clearInterval(heartbeat)
            }
        }, HEARTBEAT_MS)

        const cleanup = () => {
            clearInterval(heartbeat)
            if (peer.sse === res) {
                peer.sse = null
                peer.status = 'offline'
                peer.lastSeen = Date.now()
                this.broadcast('presence', { peerId: peer.peerId, name: peer.name, status: 'offline' }, peer.peerId)
                this.emit()
            }
        }
        req.on('close', cleanup)
        res.on('close', cleanup)
        res.on('error', cleanup)
    }

    async handleRpc(req, res) {
        const peer = this.peerByToken(req)
        if (!peer) {
            res.writeHead(401, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'unauthorized' }))
            return
        }
        if (!this.running) return json(res, 503, { error: 'room-closed' })
        let envelope
        try {
            envelope = await readBody(req)
        } catch {
            return json(res, 400, { error: 'bad-request' })
        }
        let frame
        try {
            frame = unseal(peer.key, envelope)
        } catch {
            return json(res, 403, { error: 'bad-frame' })
        }
        if (!Number.isInteger(envelope.seq) || envelope.seq <= peer.inSeq) return json(res, 409, { error: 'replay' })
        peer.inSeq = envelope.seq
        peer.lastSeen = Date.now()

        const payload = frame.payload || {}
        switch (frame.type) {
            case 'chat':
            case 'message': {
                const record = this.pushMessage({
                    kind: 'chat',
                    from: peer.peerId,
                    to: payload.to === 'all' ? 'all' : String(payload.to || 'all'),
                    text: payload.text,
                })
                if (record.to === 'all') this.broadcast('message', record, peer.peerId)
                else this.sendToPeer(record.to, 'message', record)
                break
            }
            case 'ask': {
                const ask = {
                    id: String(payload.id || `a_${Date.now()}`),
                    from: peer.peerId,
                    to: String(payload.to || 'host'),
                    text: String(payload.text || '').slice(0, 8000),
                    timeoutSec: Math.min(600, Math.max(10, Number(payload.timeoutSec) || 300)),
                }
                this.recordAsk(ask)
                if (ask.to === 'host') {
                    this.handleAskToHost(ask, peer).catch((error) => this.log('ask failed', error))
                } else {
                    this.sendToPeer(ask.to, 'ask', ask)
                }
                break
            }
            case 'answer': {
                const answer = {
                    id: String(payload.id || ''),
                    from: peer.peerId,
                    to: String(payload.to || 'host'),
                    status: payload.status === 'ok' || payload.status === 'timeout' || payload.status === 'error' ? payload.status : 'ok',
                    text: String(payload.text || '').slice(0, 8000),
                    meta: payload.meta ?? null,
                }
                if (answer.to === 'host') this.resolvePending(answer)
                else this.sendToPeer(answer.to, 'answer', answer)
                this.settleAsk(answer.id, { status: answer.status, answer: answer.text, meta: answer.meta })
                break
            }
            case 'hello':
                break
            default:
                this.log('unknown frame', frame.type)
        }

        const reply = seal(peer.key, ++peer.outSeq, { ok: true, seq: frame.seq })
        json(res, 200, reply)
    }

    async handleAskToHost(ask, fromPeer) {
        this.sendToPeer(ask.from, 'ack', { id: ask.id })
        if (typeof this.onAsk !== 'function') {
            this.sendToPeer(ask.from, 'answer', { id: ask.id, from: 'host', to: ask.from, status: 'error', text: '本机未配置回答能力', meta: null })
            this.settleAsk(ask.id, { status: 'error', answer: '本机未配置回答能力' })
            return
        }
        const answer = await this.onAsk({ peerId: fromPeer.peerId, name: fromPeer.name }, ask)
        this.sendToPeer(ask.from, 'answer', {
            id: ask.id,
            from: 'host',
            to: ask.from,
            status: answer.status,
            text: answer.text,
            meta: answer.meta ?? null,
        })
        this.settleAsk(ask.id, { status: answer.status, answer: answer.text, meta: answer.meta ?? null })
    }

    resolvePending(answer) {
        const pending = this.pending.get(answer.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(answer.id)
        pending.resolve({ status: answer.status, text: answer.text, meta: answer.meta })
    }

    sendFrame(peer, type, payload) {
        if (!peer || !peer.sse) return false
        peer.outSeq += 1
        const envelope = seal(peer.key, peer.outSeq, { type, payload })
        try {
            peer.sse.write(`data: ${JSON.stringify(envelope)}\n\n`)
            return true
        } catch {
            return false
        }
    }

    sendToPeer(peerId, type, payload) {
        const peer = this.peers.get(peerId)
        if (!peer || peer.isHost) return false
        return this.sendFrame(peer, type, payload)
    }

    broadcast(type, payload, exceptPeerId) {
        for (const peer of this.peers.values()) {
            if (peer.isHost || peer.peerId === exceptPeerId) continue
            this.sendFrame(peer, type, payload)
        }
    }

    /** Host 的 agent 向某个 peer 提问。 */
    askPeer(peerId, text, timeoutMs = 300_000, forcedId) {
        const id = forcedId || `a_${randomBytes(6).toString('hex')}`
        this.recordAsk({ id, from: 'host', to: peerId, text })
        return new Promise((resolve) => {
            if (!this.sendToPeer(peerId, 'ask', { id, from: 'host', to: peerId, text, timeoutSec: Math.round(timeoutMs / 1000) })) {
                this.settleAsk(id, { status: 'error', answer: '对方不在线' })
                resolve({ status: 'error', text: '对方不在线', meta: null })
                return
            }
            const timer = setTimeout(() => {
                this.pending.delete(id)
                this.settleAsk(id, { status: 'timeout', answer: null })
                resolve({ status: 'timeout', text: '对方未在时限内回答', meta: null })
            }, timeoutMs)
            this.pending.set(id, { resolve, timer })
        })
    }

    sendChat(to, text) {
        const record = this.pushMessage({ kind: 'chat', from: 'host', to, text })
        if (to === 'all') this.broadcast('message', record)
        else this.sendToPeer(to, 'message', record)
        return record
    }

    /** 周期性清理过期邀请码与过期的房间。 */
    tick() {
        let changed = false
        for (const invite of this.invites.values()) {
            if (invite.status === 'unused' && Date.now() > invite.expiresAt) {
                invite.status = 'expired'
                changed = true
            }
        }
        if (this.running && Date.now() > this.expiresAt) {
            this.stop('ttl')
            changed = true
        }
        if (changed) this.emit()
    }
}

/* ────────────────────────── Guest ────────────────────────── */

export class RoomGuest {
    constructor({ log = () => {} } = {}) {
        this.log = log
        this.role = 'guest'
        this.address = ''
        this.room = null
        this.self = null
        this.members = []
        this.messages = []
        this.asks = []
        this.status = 'idle'
        this.token = ''
        this.key = null
        this.outSeq = 0
        this.lastSeq = 0
        this.pending = new Map()
        this.listeners = new Set()
        this.onAsk = null
        this.streamAbort = null
        this.reconnectTimer = null
        this.attempt = 0
        this.closed = false
    }

    onChange(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit() {
        for (const listener of this.listeners) {
            try {
                listener()
            } catch {
                /* ignore */
            }
        }
    }

    async join({ address, code, displayName }) {
        if (this.status === 'joined' || this.status === 'connecting') throw new Error('already-in-room')
        const parsed = parseCode(code)
        if (!parsed) throw new Error('invite-unknown')
        const base = normalizeAddress(address)
        const peerName = String(displayName || hostName()).slice(0, 30)
        const nonce = randomBytes(16).toString('hex')
        this.status = 'connecting'
        this.emit()

        const proof = makeProof(parsed.key, parsed.inviteId, peerName, nonce)
        let response
        try {
            response = await fetch(`${base}/join`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    inviteId: parsed.inviteId,
                    peerName,
                    nonce,
                    proof,
                    proto: PROTO,
                    platform: platformName(),
                }),
            })
        } catch {
            this.status = 'idle'
            this.emit()
            throw new Error('unreachable')
        }
        if (!response.ok) {
            const payload = await response.json().catch(() => ({ error: 'join-failed' }))
            const code = typeof payload?.error === 'string' ? payload.error : 'join-failed'
            this.status = 'idle'
            this.emit()
            const failure = new Error(code)
            failure.code = code
            throw failure
        }
        const welcome = unseal(parsed.key, await response.json())
        if (welcome.proto !== PROTO) {
            const failure = new Error('proto-mismatch')
            failure.code = 'proto-mismatch'
            this.status = 'idle'
            this.emit()
            throw failure
        }

        this.address = base
        this.key = parsed.key
        this.token = welcome.token
        this.self = { peerId: welcome.peerId, name: peerName, platform: platformName() }
        this.room = welcome.room
        this.members = welcome.members || []
        this.status = 'joined'
        this.closed = false
        this.attempt = 0
        this.outSeq = 0
        this.lastSeq = 0
        this.pushMessage({ kind: 'system', from: 'host', to: 'all', text: `已加入 ${welcome.room?.hostName || '房间'}` })
        this.emit()
        this.openStream()
        return this.snapshot()
    }

    leave() {
        this.closed = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        if (this.streamAbort) this.streamAbort.abort()
        this.streamAbort = null
        this.status = 'idle'
        this.room = null
        this.self = null
        this.members = []
        this.messages = []
        this.asks = []
        this.token = ''
        this.key = null
        this.emit()
    }

    async openStream() {
        if (this.closed || !this.token) return
        const controller = new AbortController()
        this.streamAbort = controller
        try {
            const response = await fetch(`${this.address}/events?token=${encodeURIComponent(this.token)}`, {
                headers: { accept: 'text/event-stream' },
                signal: controller.signal,
            })
            if (!response.ok || !response.body) throw new Error(`stream ${response.status}`)
            this.attempt = 0
            this.status = 'joined'
            this.emit()
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                let index
                while ((index = buffer.indexOf('\n\n')) >= 0) {
                    const chunk = buffer.slice(0, index)
                    buffer = buffer.slice(index + 2)
                    this.consumeSse(chunk)
                }
            }
        } catch (error) {
            if (this.closed || controller.signal.aborted) return
            this.log('stream ended', error)
        }
        if (this.closed) return
        this.status = 'reconnecting'
        this.emit()
        const delay = Math.min(8000, 1000 * 2 ** Math.min(this.attempt, 3))
        this.attempt += 1
        this.reconnectTimer = setTimeout(() => this.openStream(), delay)
    }

    consumeSse(chunk) {
        const line = chunk
            .split('\n')
            .map((item) => item.trim())
            .find((item) => item.startsWith('data:'))
        if (!line) return
        let envelope
        try {
            envelope = JSON.parse(line.slice(5).trim())
        } catch {
            return
        }
        let frame
        try {
            frame = unseal(this.key, envelope)
        } catch (error) {
            this.log('bad frame', error)
            return
        }
        if (typeof envelope?.seq === 'number') {
            if (envelope.seq <= this.lastSeq) return
            this.lastSeq = envelope.seq
        }
        this.handleFrame(frame)
    }

    handleFrame(envelope) {
        const { type, payload } = envelope
        if (!type) return
        if (type === 'message' || type === 'chat') {
            this.pushMessage({
                id: payload.id,
                kind: payload.kind || 'chat',
                from: payload.from,
                to: payload.to,
                text: payload.text,
                ts: payload.ts,
            })
            return
        }
        if (type === 'presence') {
            const index = this.members.findIndex((member) => member.peerId === payload.peerId)
            const base = { peerId: payload.peerId, name: payload.name || 'peer', platform: '', status: payload.status, isHost: false, isSelf: false, joinedAt: Date.now(), lastSeen: Date.now() }
            if (index >= 0) this.members[index] = { ...this.members[index], status: payload.status }
            else if (payload.status !== 'offline') this.members.push(base)
            this.emit()
            return
        }
        if (type === 'ask') {
            const ask = {
                id: String(payload.id),
                from: payload.from,
                to: payload.to,
                text: String(payload.text || ''),
                status: 'pending',
                createdAt: Date.now(),
                answeredAt: null,
                answer: null,
                meta: null,
            }
            this.asks.push(ask)
            this.emit()
            this.answerAsk(ask).catch((error) => this.log('answer failed', error))
            return
        }
        if (type === 'answer') {
            const pending = this.pending.get(payload.id)
            if (pending) {
                clearTimeout(pending.timer)
                this.pending.delete(payload.id)
                pending.resolve({ status: payload.status, text: payload.text, meta: payload.meta })
            }
            const ask = this.asks.find((item) => item.id === payload.id)
            if (ask) {
                Object.assign(ask, { status: payload.status, answer: payload.text, meta: payload.meta, answeredAt: Date.now() })
                this.emit()
            }
            return
        }
        if (type === 'room-closed') {
            this.closed = true
            if (this.streamAbort) this.streamAbort.abort()
            this.status = 'closed'
            this.emit()
        }
    }

    async answerAsk(ask) {
        if (typeof this.onAsk !== 'function') {
            await this.rpc('answer', { id: ask.id, from: this.self.peerId, to: ask.from, status: 'error', text: '本机未配置回答能力', meta: null })
            return
        }
        const answer = await this.onAsk({ peerId: ask.from, name: this.memberName(ask.from) }, ask)
        const settle = { status: answer.status, answer: answer.text, meta: answer.meta ?? null, answeredAt: Date.now() }
        Object.assign(ask, settle)
        this.emit()
        await this.rpc('answer', { id: ask.id, from: this.self.peerId, to: ask.from, status: answer.status, text: answer.text, meta: answer.meta ?? null })
    }

    memberName(peerId) {
        return this.members.find((member) => member.peerId === peerId)?.name || peerId
    }

    pushMessage(message) {
        const record = {
            id: message.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            kind: message.kind || 'chat',
            from: message.from || this.self?.peerId || 'unknown',
            to: message.to || 'all',
            text: String(message.text ?? '').slice(0, 8000),
            ts: message.ts || Date.now(),
        }
        this.messages.push(record)
        if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES)
        this.emit()
        return record
    }

    async rpc(type, payload) {
        if (!this.token) throw new Error('no-room')
        const envelope = seal(this.key, ++this.outSeq, { type, payload })
        const response = await fetch(`${this.address}/rpc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
            body: JSON.stringify(envelope),
        })
        if (!response.ok) throw new Error(`rpc ${response.status}`)
        return response.json()
    }

    ask(to, text, timeoutMs = 300_000, forcedId) {
        const id = forcedId || `a_${randomBytes(6).toString('hex')}`
        const ask = { id, from: this.self.peerId, to, text, status: 'pending', createdAt: Date.now(), answeredAt: null, answer: null, meta: null }
        this.asks.push(ask)
        this.emit()
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                Object.assign(ask, { status: 'timeout', answeredAt: Date.now() })
                this.emit()
                resolve({ status: 'timeout', text: '对方未在时限内回答', meta: null })
            }, timeoutMs)
            this.pending.set(id, { resolve, timer })
            this.rpc('ask', { id, from: this.self.peerId, to, text, timeoutSec: Math.round(timeoutMs / 1000) }).catch(async (error) => {
                clearTimeout(timer)
                this.pending.delete(id)
                Object.assign(ask, { status: 'error', answeredAt: Date.now() })
                this.emit()
                resolve({ status: 'error', text: String(error?.message || error), meta: null })
            })
        })
    }

    send(to, text) {
        const record = this.pushMessage({ kind: 'chat', from: this.self.peerId, to, text })
        this.rpc('message', { to, text }).catch((error) => this.log('send failed', error))
        return record
    }

    snapshot() {
        return {
            role: this.role,
            self: this.self,
            room: this.room
                ? {
                      id: this.room.id,
                      title: this.room.title,
                      address: this.address.replace(/^https?:\/\//, ''),
                      port: Number(this.address.split(':').pop()) || 0,
                      createdAt: 0,
                      expiresAt: this.room.expiresAt,
                      memberLimit: this.room.memberLimit,
                      hostName: this.room.hostName,
                      status: this.status,
                  }
                : null,
            members: [
                ...(this.self
                    ? [{ ...this.self, status: this.status === 'joined' ? 'online' : 'offline', isHost: false, isSelf: true, joinedAt: 0, lastSeen: Date.now() }]
                    : []),
                ...this.members
                    .filter((member) => member.peerId !== this.self?.peerId)
                    .map((member) => ({ ...member, isSelf: false })),
            ],
            invites: [],
            messages: this.messages,
            asks: this.asks,
            status: this.status,
        }
    }
}

export function normalizeAddress(address) {
    let value = String(address || '').trim()
    if (!value) throw new Error('address-required')
    if (!/^https?:\/\//.test(value)) value = `http://${value}`
    return value.replace(/\/+$/, '')
}
