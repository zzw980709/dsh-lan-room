/**
 * 无 DSH 的端到端自测：起一个 Host 插件实例 + 一个 Guest 插件实例（同进程），
 * 用真实的 HTTP/SSE/加密协议跑通「开房 → 邀请码加入 → 互相提问 → 收到回答」。
 *
 * 运行：node test/e2e.mjs
 */
import { createPlugin } from '../lib/plugin.js'
import { parseCode, seal, unseal, makeProof, randomCode } from '../lib/room.js'

const ANSWER = '这是来自 Guest 的 stub 回答：先执行 cp config/local.example.yml config/local.yml。'

function makeCtx(label) {
    const tools = new Map()
    const routes = []
    const disposers = []
    const ctx = {
        label,
        tools: {
            register(definition) {
                tools.set(definition.name, definition)
                return () => tools.delete(definition.name)
            },
            definitions() {
                return [...tools.values()]
            },
        },
        webServer: {
            register(route) {
                routes.push(route)
                return () => {}
            },
        },
        agents: {
            async create({ setup, sessionId }) {
                setup?.(
                    {
                        tools: { restrict() {} },
                        systemPrompt: { section() {} },
                    },
                    { id: sessionId },
                )
                return { agent: { id: sessionId }, dispose() {} }
            },
        },
        sessionController: (() => {
            let polls = 0
            return {
                async rename() {},
                async state() {
                    polls += 1
                    return polls === 1
                        ? { running: true, cursor: 5, pendingInput: [] }
                        : { running: false, cursor: 9, pendingInput: [] }
                },
                async prompt() {},
                async events() {
                    return {
                        records: [
                            {
                                type: 'event',
                                event: { type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'text', text: ANSWER }] } } },
                            },
                        ],
                    }
                },
                async wait() {
                    return {
                        reason: 'idle',
                        output: {
                            records: [
                                {
                                    type: 'event',
                                    event: { type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'text', text: ANSWER }] } } },
                                },
                            ],
                        },
                    }
                },
            }
        })(),
        sessions: { get: () => undefined },
        workingDirectory: { defaultDirectory: '/tmp' },
        approval: { setPolicy() {} },
        logger: { info() {} },
        effect(fn) {
            disposers.push(fn())
        },
        get(name) {
            return this[name]
        },
    }
    return { ctx, tools, routes, dispose: () => disposers.forEach((fn) => fn?.()) }
}

function assert(condition, message) {
    if (!condition) {
        console.error(`✗ ${message}`)
        process.exitCode = 1
    } else {
        console.log(`✓ ${message}`)
    }
}

/* ── 1. 纯函数：邀请码与加解密 ── */
{
    const code = randomCode(8)
    const parsed = parseCode(code)
    assert(parsed && parsed.inviteId === code.slice(0, 2), '邀请码解析出 inviteId')
    const envelope = seal(parsed.key, 7, { hello: 'world' })
    const opened = unseal(parsed.key, envelope)
    assert(opened.hello === 'world' && envelope.seq === 7, 'AES-GCM 帧可加解密')
    const other = parseCode(randomCode(8))
    let failed = false
    try {
        unseal(other.key, envelope)
    } catch {
        failed = true
    }
    assert(failed, '错误密钥无法解开帧')
    const proof = makeProof(parsed.key, parsed.inviteId, 'zzw-air', 'nonce')
    assert(proof.length === 64, 'HMAC proof 生成正常')
    assert(parseCode(code.toLowerCase().replace(/(.{4})/, '$1-')).code === code, '邀请码归一化忽略大小写与分隔符')
}

/* ── 2. 启动 Host + Guest ── */
const host = makeCtx('host')
const guest = makeCtx('guest')
const disposeHost = createPlugin(host.ctx, {})
const disposeGuest = createPlugin(guest.ctx, {})

const hostCreate = host.tools.get('lan_room_create')
const hostInvite = host.tools.get('lan_room_invite')
const hostStatus = host.tools.get('lan_room_status')
const hostAsk = host.tools.get('lan_ask')
const guestJoin = guest.tools.get('lan_room_join')
const guestStatus = guest.tools.get('lan_room_status')

const created = await hostCreate.execute({ title: '测试房间', displayName: 'host-box' })
assert(created.status === 'ok', `开房成功（端口 ${created.room?.port}）`)
assert(/^\d+\.\d+\.\d+\.\d+:\d+$/.test(created.room?.address ?? ''), `房间地址可读：${created.room?.address}`)
const inviteCode = created.invite.code
assert(parseCode(inviteCode) !== null, `邀请码格式正确：${inviteCode}`)

const second = await hostInvite.execute({ count: 2 })
assert(second.status === 'ok' && second.invites.length === 2, '可再次生成邀请码')

const joined = await guestJoin.execute({
    code: inviteCode,
    address: `127.0.0.1:${created.room.port}`,
    displayName: 'guest-air',
})
assert(joined.status === 'ok', `Guest 用邀请码加入成功${joined.status !== 'ok' ? `：${joined.error?.message}` : ''}`)
assert(joined.room?.hostName === 'host-box', 'Guest 看到主持人名字')

await new Promise((resolve) => setTimeout(resolve, 300))

const hostView = await hostStatus.execute({})
assert(hostView.members.length === 2, `Host 看到 2 名成员（${hostView.members.map((m) => m.name).join(',')}）`)
const guestView = await guestStatus.execute({})
assert(guestView.members.length >= 1, 'Guest 看到成员列表')

const guestMember = hostView.members.find((member) => member.name === 'guest-air')
assert(Boolean(guestMember), 'Host 能定位到 guest 的 peer')

const answered = await hostAsk.execute({ peer: 'guest-air', question: '这个报错怎么修？', timeoutSeconds: 30 })
assert(answered.status === 'ok', `Host 提问拿到回答（status=${answered.status}）`)
assert(answered.answer.includes('stub 回答'), `回答内容正确：${answered.answer.slice(0, 40)}…`)

const guestAsked = await guestStatus.execute({})
assert(guestAsked.asks.length >= 1, 'Guest 侧记录了收到的提问')

/* ── 3. 一次性：同一张邀请码不能再用 ── */
const replay = await guestJoin.execute({
    code: inviteCode,
    address: `127.0.0.1:${created.room.port}`,
    displayName: 'replayer',
})
assert(replay.status === 'error', `同一邀请码二次使用被拒绝（${replay.error?.code}）`)

/* ── 4. 关闭房间 ── */
host.tools.get('lan_room_leave').execute({})
await new Promise((resolve) => setTimeout(resolve, 100))
const after = await hostStatus.execute({})
assert(after.mode === 'idle', 'Host 关闭房间后回到 idle')

disposeHost()
disposeGuest()
host.dispose()
guest.dispose()
console.log(process.exitCode ? '\nFAILED' : '\nALL PASSED')
