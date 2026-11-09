/**
 * dsh-lan-room · 局域网联机插件（Host 半）
 *
 * 一台机器开房（房间服务监听 0.0.0.0:8787），其他人用一次性邀请码加入；
 * 各自的 agent 通过 lan_ask 互相提问，面板通过本机 loopback 的 /lan-room 控制面驱动。
 */
import { randomBytes } from 'node:crypto'

// 带版本号的动态加载：DSH 的 ESM 模块缓存按 URL 生效，禁/启插件行即可拿到最新实现。
const stamp = new URL(import.meta.url).searchParams.get('v') || 'dev'
const { AgentBridge } = await import(`./bridge.js?v=${stamp}`)
const { json, normalizeAddress, readBody, RoomGuest, RoomHost, PROTO } = await import(`./room.js?v=${stamp}`)

const MEMBER_LIMIT = 8
const ASK_TIMEOUT_MS = 300_000

const OUTPUT_TEXT = (text) => [{ type: 'text', text }]

function out(schema, render) {
    return { schema, render }
}

export function createPlugin(ctx, config = {}) {
    const log = (...args) => {
        try {
            ctx.logger?.info?.('[lan-room]', ...args)
        } catch {
            /* logging must never break the plugin */
        }
    }

    const plugin = {
        ctx,
        mode: 'idle',
        host: null,
        guest: null,
        bridge: null,
        timer: null,

        bridgeFor() {
            if (!this.bridge) {
                this.bridge = new AgentBridge({ ctx, log })
                this.bridge.onLate = (info) => this.noteLate(info)
            }
            return this.bridge
        },

        attachAskHandler(room) {
            room.onAsk = async (peer, ask) => {
                try {
                    return await this.bridgeFor().ask(peer, ask.text, (ask.timeoutSec || 300) * 1000)
                } catch (error) {
                    log('ask handler failed', error)
                    return { status: 'error', text: `本机处理提问失败：${error?.message ?? error}`, meta: null }
                }
            }
        },

        noteLate(info) {
            const text = `（迟到的回答 · ${info.name}）\n${info.text}`
            if (this.mode === 'host' && this.host) this.host.pushMessage({ kind: 'system', from: 'host', to: 'all', text })
            if (this.mode === 'guest' && this.guest) this.guest.pushMessage({ kind: 'system', from: 'host', to: 'all', text })
        },

        async create({ title, displayName, port, ttlMinutes } = {}) {
            if (this.mode !== 'idle') throw Object.assign(new Error('已经在房间中'), { code: 'already-in-room' })
            const host = new RoomHost({ log })
            await host.start({
                title,
                displayName: displayName || config.displayName,
                port: Number(port) || Number(config.port) || 8787,
                ttlMinutes: Number(ttlMinutes) || Number(config.ttlMinutes) || 480,
            })
            this.host = host
            this.mode = 'host'
            this.attachAskHandler(host)
            const invite = host.addInvite({ ttlMinutes: 24 * 60 })
            return { room: host.snapshot().room, invite: { code: invite.code, expiresAt: invite.expiresAt } }
        },

        invite({ count = 1, ttlMinutes } = {}) {
            if (this.mode !== 'host' || !this.host) throw Object.assign(new Error('当前不是主持人'), { code: 'not-host' })
            const invites = []
            for (let i = 0; i < Math.min(5, Math.max(1, Number(count) || 1)); i++) invites.push(this.host.addInvite({ ttlMinutes }))
            return invites.map((invite) => ({ code: invite.code, inviteId: invite.inviteId, expiresAt: invite.expiresAt }))
        },

        revokeInvite({ inviteId } = {}) {
            if (this.mode !== 'host' || !this.host) throw Object.assign(new Error('当前不是主持人'), { code: 'not-host' })
            if (!this.host.revokeInvite(inviteId)) throw Object.assign(new Error('邀请码不存在'), { code: 'invite-unknown' })
            return this.host.snapshot().invites
        },

        async join({ code, address, displayName } = {}) {
            if (this.mode !== 'idle') throw Object.assign(new Error('已经在房间中'), { code: 'already-in-room' })
            const guest = new RoomGuest({ log })
            this.guest = guest
            this.mode = 'guest'
            try {
                await guest.join({ address: normalizeAddress(address), code, displayName: displayName || config.displayName })
                this.attachAskHandler(guest)
                return guest.snapshot().room
            } catch (error) {
                this.mode = 'idle'
                this.guest = null
                guest.leave()
                throw error
            }
        },

        leave() {
            if (this.mode === 'host' && this.host) {
                this.host.stop('host-closed')
            }
            if (this.mode === 'guest' && this.guest) {
                this.guest.leave()
            }
            this.bridge?.dispose()
            this.bridge = null
            this.host = null
            this.guest = null
            this.mode = 'idle'
        },

        roomOf() {
            if (this.mode === 'host') return this.host
            if (this.mode === 'guest') return this.guest
            return null
        },

        snapshot() {
            const base = this.mode === 'idle'
                ? {
                      role: 'idle',
                      self: { peerId: 'host', name: config.displayName || '本机', platform: process.platform },
                      room: null,
                      members: [],
                      invites: [],
                      messages: [],
                      asks: [],
                  }
                : this.roomOf().snapshot()
            return { ...base, mode: this.mode, proto: PROTO, memberLimit: MEMBER_LIMIT }
        },

        resolvePeer(query) {
            const room = this.roomOf()
            if (!room) throw Object.assign(new Error('当前不在房间中'), { code: 'no-room' })
            const members = this.snapshot().members.filter((member) => !member.isSelf)
            const wanted = String(query || '').trim()
            if (!wanted) throw Object.assign(new Error('请指定 peer'), { code: 'peer-unknown' })
            const exact = members.find((member) => member.peerId === wanted)
            if (exact) return exact
            const byName = members.filter((member) => member.name.toLowerCase() === wanted.toLowerCase())
            if (byName.length === 1) return byName[0]
            const byPrefix = members.filter((member) => member.name.toLowerCase().startsWith(wanted.toLowerCase()))
            if (byPrefix.length === 1) return byPrefix[0]
            throw Object.assign(new Error(`找不到 peer：${wanted}`), { code: 'peer-unknown' })
        },

        async ask({ peer, question, timeoutSeconds, askId } = {}) {
            const target = this.resolvePeer(peer)
            const text = String(question || '').trim()
            if (!text) throw Object.assign(new Error('问题不能为空'), { code: 'invalid-argument' })
            const timeoutMs = Math.min(600, Math.max(10, Number(timeoutSeconds) || ASK_TIMEOUT_MS / 1000)) * 1000
            if (this.mode === 'host') {
                const result = await this.host.askPeer(target.peerId, text, timeoutMs, askId)
                return { target: { peerId: target.peerId, name: target.name }, ...result }
            }
            if (this.mode === 'guest') {
                const result = await this.guest.ask(target.peerId, text, timeoutMs, askId)
                return { target: { peerId: target.peerId, name: target.name }, ...result }
            }
            throw Object.assign(new Error('当前不在房间中'), { code: 'no-room' })
        },

        send({ to, text } = {}) {
            const body = String(text || '').trim()
            if (!body) throw Object.assign(new Error('消息不能为空'), { code: 'invalid-argument' })
            const target =
                String(to || '').toLowerCase() === 'all' || !to
                    ? 'all'
                    : this.resolvePeer(to).peerId
            const record =
                this.mode === 'host'
                    ? this.host.sendChat(target, body)
                    : this.mode === 'guest'
                      ? this.guest.send(target, body)
                      : null
            if (!record) throw Object.assign(new Error('当前不在房间中'), { code: 'no-room' })
            return { messageId: record.id, to: target }
        },

        handleControl: null,
    }

    /* ────────────────────────── 控制面 ────────────────────────── */

    const handleControl = async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'local'}`)
        const route = `${req.method} ${url.pathname.replace(/^\/lan-room/, '') || '/'}`
        const reply = (value) => json(res, 200, value)
        const fail = (error) => {
            const code = error?.code || 'internal'
            const message = error?.message || String(error)
            reply({ ok: false, error: { code, message } })
        }

        try {
            if (route === 'GET /state' || route === 'GET /') {
                return reply({ ok: true, data: plugin.snapshot() })
            }
            if (route === 'POST /create') {
                const body = await readBody(req)
                const data = await plugin.create(body)
                return reply({ ok: true, data })
            }
            if (route === 'POST /invite') {
                const data = plugin.invite(await readBody(req))
                return reply({ ok: true, data: { invites: data } })
            }
            if (route === 'POST /revokeInvite') {
                const { inviteId } = await readBody(req)
                return reply({ ok: true, data: { invites: plugin.revokeInvite({ inviteId }) } })
            }
            if (route === 'POST /join') {
                const data = await plugin.join(await readBody(req))
                return reply({ ok: true, data: { room: data } })
            }
            if (route === 'POST /leave') {
                plugin.leave()
                return reply({ ok: true, data: { ok: true } })
            }
            if (route === 'POST /ask') {
                const { to, text } = await readBody(req)
                const target = plugin.resolvePeer(to)
                const askId = `a_${randomBytes(6).toString('hex')}`
                plugin.ask({ peer: target.peerId, question: text, timeoutSeconds: 300, askId }).catch((error) => log('control ask failed', error))
                return reply({ ok: true, data: { askId, to: target.peerId } })
            }
            if (route === 'POST /send') {
                const body = await readBody(req)
                return reply({ ok: true, data: plugin.send(body) })
            }
            return reply({ ok: false, error: { code: 'not-found', message: `未知接口：${route}` } })
        } catch (error) {
            fail(error)
        }
    }

    plugin.handleControl = handleControl

    /* ────────────────────────── 工具 ────────────────────────── */

    const summaries = {
        created: (value) => `房间已创建：${value.room.id} · ${value.room.address} · 邀请码 ${value.invite.code}`,
        joined: (value) => `已加入房间 ${value.room.id}（主持人 ${value.room.hostName}）`,
    }

    ctx.tools.register({
        name: 'lan_room_create',
        description:
            'Open a LAN room on this machine. The room listens on the local network; peers join with a one-time invite code. Returns the room id, the LAN address and one invite code.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                title: { type: 'string', description: 'Room title shown to every member.' },
                displayName: { type: 'string', description: 'This machine display name inside the room.' },
                port: { type: 'number', description: 'LAN port to listen on. Defaults to 8787 and advances on conflicts.' },
                ttlMinutes: { type: 'number', description: 'Room lifetime in minutes. Defaults to 480.' },
            },
        },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'room', 'invite'],
                properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    room: {
                        type: 'object',
                        additionalProperties: true,
                        properties: { id: { type: 'string' }, address: { type: 'string' }, port: { type: 'number' } },
                    },
                    invite: { type: 'object', additionalProperties: true, properties: { code: { type: 'string' } } },
                    error: { type: 'object', additionalProperties: true },
                },
            },
            (args, value) => OUTPUT_TEXT(value.status === 'ok' ? summaries.created(value) : `创建失败：${value.error?.message ?? ''}`),
        ),
        async execute(args) {
            try {
                const data = await plugin.create(args)
                return { status: 'ok', ...data }
            } catch (error) {
                return { status: 'error', room: null, invite: null, error: { code: error?.code || 'internal', message: error?.message || String(error) } }
            }
        },
        isConcurrencySafe: () => false,
        presentCall: () => ({ card: 'generic', title: '创建局域网房间', kind: 'other' }),
    })

    ctx.tools.register({
        name: 'lan_room_invite',
        description: 'Generate one or more one-time invite codes for the room this machine hosts. Each code works once and expires.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                count: { type: 'number', description: 'How many codes to create (1-5).' },
                ttlMinutes: { type: 'number', description: 'Invite lifetime in minutes. Defaults to 1440.' },
            },
        },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'invites'],
                properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    invites: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    error: { type: 'object', additionalProperties: true },
                },
            },
            (args, value) =>
                OUTPUT_TEXT(
                    value.status === 'ok'
                        ? `已生成 ${value.invites.length} 张邀请码：${value.invites.map((item) => item.code).join('、')}`
                        : `生成失败：${value.error?.message ?? ''}`,
                ),
        ),
        async execute(args) {
            try {
                return { status: 'ok', invites: plugin.invite(args) }
            } catch (error) {
                return { status: 'error', invites: [], error: { code: error?.code || 'internal', message: error?.message || String(error) } }
            }
        },
        isConcurrencySafe: () => false,
    })

    ctx.tools.register({
        name: 'lan_room_join',
        description: 'Join a LAN room hosted by another machine using a one-time invite code. Requires the host address like 192.168.1.23:8787.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'address'],
            properties: {
                code: { type: 'string', description: 'One-time invite code, case and separators are ignored.' },
                address: { type: 'string', description: 'Host address and port, for example 192.168.1.23:8787.' },
                displayName: { type: 'string', description: 'This machine display name inside the room.' },
            },
        },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'room'],
                properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    room: { type: 'object', additionalProperties: true },
                    error: { type: 'object', additionalProperties: true },
                },
            },
            (args, value) => OUTPUT_TEXT(value.status === 'ok' ? summaries.joined(value) : `加入失败：${value.error?.message ?? ''}`),
        ),
        async execute(args) {
            try {
                const room = await plugin.join(args)
                return { status: 'ok', room }
            } catch (error) {
                return { status: 'error', room: null, error: { code: error?.code || 'internal', message: error?.message || String(error) } }
            }
        },
        isConcurrencySafe: () => false,
    })

    ctx.tools.register({
        name: 'lan_room_status',
        description: 'Report the current LAN room: members, online state, invite codes left, recent messages and pending questions.',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status'],
                properties: {
                    status: { type: 'string', enum: ['ok'] },
                    mode: { type: 'string' },
                    room: { type: 'object', additionalProperties: true },
                    members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    invites: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    messages: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    asks: { type: 'array', items: { type: 'object', additionalProperties: true } },
                },
            },
            (args, value) => {
                if (value.mode === 'idle') return OUTPUT_TEXT('当前不在任何房间中。')
                const members = value.members.map((member) => `${member.name}（${member.isHost ? '主持' : member.status}）`).join('、')
                return OUTPUT_TEXT(`房间 ${value.room?.id}：${members}`)
            },
        ),
        async execute() {
            const snapshot = plugin.snapshot()
            return { status: 'ok', ...snapshot, room: snapshot.room ?? {} }
        },
        isConcurrencySafe: () => true,
    })

    ctx.tools.register({
        name: 'lan_ask',
        description:
            'Ask another agent in the LAN room a question and wait for its answer. The remote agent answers from its own machine with read-only tools. Use it for cross-machine questions.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['peer', 'question'],
            properties: {
                peer: { type: 'string', description: 'Member name or peer id to ask.' },
                question: { type: 'string', description: 'The question to ask.' },
                timeoutSeconds: { type: 'number', description: 'How long to wait. Defaults to 300, max 600.' },
            },
        },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'target', 'answer'],
                properties: {
                    status: { type: 'string', enum: ['ok', 'timeout', 'error'] },
                    target: { type: 'object', additionalProperties: true },
                    answer: { type: 'string' },
                    meta: { type: 'object', additionalProperties: true },
                    error: { type: 'object', additionalProperties: true },
                },
            },
            (args, value) => {
                if (value.status === 'ok') return OUTPUT_TEXT(`${value.target.name} 的回答：\n${value.answer}`)
                return OUTPUT_TEXT(`${value.target.name} 没有给出回答（${value.status}${value.error ? `：${value.error.message}` : ''}）`)
            },
        ),
        async execute(args) {
            try {
                const result = await plugin.ask(args)
                return { status: result.status, target: result.target, answer: result.text || '', meta: result.meta ?? {} }
            } catch (error) {
                return { status: 'error', target: { peerId: '', name: String(args?.peer ?? '') }, answer: '', meta: null, error: { code: error?.code || 'internal', message: error?.message || String(error) } }
            }
        },
        isConcurrencySafe: () => false,
        presentCall: (args) => ({ card: 'generic', title: `向 ${args?.peer ?? 'peer'} 提问`, kind: 'other' }),
    })

    ctx.tools.register({
        name: 'lan_send',
        description: 'Send a plain message to the room or to one member. It is delivered without waiting for an answer.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['text'],
            properties: {
                to: { type: 'string', description: 'Member name, peer id, or "all". Defaults to all.' },
                text: { type: 'string', description: 'Message body.' },
            },
        },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'messageId'],
                properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    messageId: { type: 'string' },
                    error: { type: 'object', additionalProperties: true },
                },
            },
            (args, value) => OUTPUT_TEXT(value.status === 'ok' ? '消息已发送。' : `发送失败：${value.error?.message ?? ''}`),
        ),
        async execute(args) {
            try {
                const result = plugin.send(args)
                return { status: 'ok', messageId: result.messageId }
            } catch (error) {
                return { status: 'error', messageId: '', error: { code: error?.code || 'internal', message: error?.message || String(error) } }
            }
        },
        isConcurrencySafe: () => true,
    })

    ctx.tools.register({
        name: 'lan_room_leave',
        description: 'Leave the current LAN room, or close the room this machine hosts.',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        output: out(
            {
                type: 'object',
                additionalProperties: false,
                required: ['status'],
                properties: { status: { type: 'string', enum: ['ok'] } },
            },
            () => OUTPUT_TEXT('已离开房间。'),
        ),
        async execute() {
            plugin.leave()
            return { status: 'ok' }
        },
        isConcurrencySafe: () => false,
    })

    /* ────────────────────────── 生命周期 ────────────────────────── */

    plugin.timer = setInterval(() => {
        try {
            if (plugin.mode === 'host' && plugin.host) plugin.host.tick()
        } catch (error) {
            log('tick failed', error)
        }
    }, 30_000)
    plugin.timer.unref?.()

    try {
        ctx.webServer.register({ kind: 'prefix', path: '/lan-room', handler: handleControl })
    } catch (error) {
        log('control routes failed', error)
    }

    const dispose = () => {
        try {
            if (plugin.timer) clearInterval(plugin.timer)
            plugin.leave()
        } catch (error) {
            log('dispose failed', error)
        }
    }

    log('ready', { proto: PROTO })
    return dispose
}
