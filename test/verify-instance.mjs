/**
 * 隔离实例验收：对一个已经在跑的 DSH 实例（带本插件）跑完整流程。
 *
 * 用法：node test/verify-instance.mjs http://127.0.0.1:53999 [guest-name]
 *
 * 覆盖：
 * 1. 控制面创建房间、拿邀请码
 * 2. 外部 Guest 用邀请码加入（真实握手 + SSE）
 * 3. Guest 问 Host 的 agent，拿到真实回答
 * 4. Host 通过控制面问 Guest，Guest 的 onAsk 应答，状态落为 ok
 * 5. 关闭房间
 */
import { RoomGuest } from '../lib/room.js'

const base = process.argv[2] || 'http://127.0.0.1:53999'
const guestName = process.argv[3] || 'verify-guest'

const api = async (path, body) => {
    const response = await fetch(`${base}/lan-room${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json()
    if (!payload.ok) throw new Error(`${path} 失败：${payload.error?.code} ${payload.error?.message}`)
    return payload.data
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const checks = []
const check = (ok, label, detail = '') => {
    checks.push({ ok, label, detail })
    console.log(`${ok ? '✓' : '✗'} ${label}${detail && !ok ? ` — ${detail}` : ''}`)
}

try {
    await api('/leave', {}).catch(() => {})

    /* 1. 创建房间 */
    const created = await api('/create', { title: '验收房间', displayName: 'verify-host', ttlMinutes: 10 })
    check(Boolean(created.room?.id), `创建房间 ${created.room?.id}`)
    check(created.invite?.code?.length === 8, `邀请码 ${created.invite?.code}`)
    const port = created.room.port

    /* 2. Guest 加入 */
    const guest = new RoomGuest()
    guest.onAsk = async (_peer, ask) => ({
        status: 'ok',
        text: `guest-side answer for: ${String(ask.text).slice(0, 40)}`,
        meta: { stub: true },
    })
    const joined = await guest.join({ address: `127.0.0.1:${port}`, code: created.invite.code, displayName: guestName })
    check(joined.room.id === created.room.id, 'Guest 用邀请码加入成功')
    await sleep(500)

    const hostState = await api('/state')
    check(hostState.members.some((member) => member.name === guestName), `Host 看到成员 ${guestName}`)

    /* 3. Guest 问 Host */
    const askStart = Date.now()
    const answer = await guest.ask('host', '用一句中文回答：跨机提问链路是否通了？', 120_000)
    check(answer.status === 'ok' && answer.text.length > 0, `Guest→Host 回答（${Math.round((Date.now() - askStart) / 1000)}s）`, `${answer.status} ${answer.text}`)
    console.log(`   回答：${answer.text.slice(0, 120)}`)

    /* 4. Host 问 Guest（控制面） */
    const asked = await api('/ask', { to: guestName, text: '反向验证：Host 能问到你吗？' })
    check(Boolean(asked.askId), `控制面返回 askId ${asked.askId}`)
    let askRecord = null
    for (let i = 0; i < 40; i += 1) {
        await sleep(300)
        const state = await api('/state')
        askRecord = state.asks.find((item) => item.id === asked.askId)
        if (askRecord && askRecord.status !== 'pending') break
    }
    check(askRecord?.status === 'ok', `Host→Guest 回答入账（${askRecord?.status}）`, JSON.stringify(askRecord))
    check((askRecord?.answer ?? '').includes('guest-side answer'), 'Host 侧拿到 Guest 的答案文本')

    /* 5. 关闭 */
    await api('/leave', {})
    const after = await api('/state')
    check(after.role === 'idle' && after.room === null, '关闭房间后回到 idle')
    guest.leave()
} catch (error) {
    check(false, '流程异常', error?.stack || String(error))
}

const failed = checks.filter((item) => !item.ok)
console.log(failed.length === 0 ? '\nALL PASSED' : `\nFAILED (${failed.length})`)
process.exit(failed.length === 0 ? 0 : 1)
