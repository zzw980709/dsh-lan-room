/**
 * dsh-lan-room · Client 半：侧边栏「联机」图钉 + 主区「联机」页面。
 *
 * 只通过同源 HTTP 访问本机 Host 的 /lan-room 控制面（见 DOCS/control-api.md）。
 * 无 JSX、无构建、无外部依赖；样式全部内联，颜色取自 --dsw-alias-* 主题变量。
 */
window.__ModuleLoader__.load({
    id: 'dsh-lan-room',
    factory(require) {
        const React = require('react')
        const h = React.createElement
        const { useState, useEffect, useRef, useMemo } = React

        const NS = 'lan-room'
        const STATE_PATH = '/lan-room/state'
        const API_BASE = '/lan-room'
        const POLL_MS = 1500

        /* ────────────────────────────── 内置文案（locale 服务异常时的兜底） ────────────────────────────── */

        const ZH = {
            'lan.title': '联机',
            'lan.loading': '正在读取房间状态…',
            'lan.empty.title': '局域网联机',
            'lan.empty.sub': '同一局域网内，让两台机器的 agent 直接对话',
            'lan.empty.foot': '同一局域网内使用，无需服务器 · 邀请码一次性 · 每条提问都由对方的 agent 回答',
            'lan.empty.start': '开始 →',
            'lan.empty.join': '输入邀请码 →',
            'lan.create.title': '创建房间',
            'lan.create.desc': '本机作为主持，开启一个局域网房间，生成一次性邀请码。',
            'lan.create.name': '房间名',
            'lan.create.defaultTitle': '我的房间',
            'lan.create.displayName': '本机显示名',
            'lan.create.port': '端口',
            'lan.create.ttl': '有效期',
            'lan.create.action': '创建房间',
            'lan.join.title': '加入房间',
            'lan.join.desc': '输入同事发来的邀请码，进入房间和对方的 agent 对话。',
            'lan.join.code': '邀请码',
            'lan.join.address': '房间地址',
            'lan.join.address.optional': '可选，二维码会自带',
            'lan.join.name': '我的显示名',
            'lan.join.action': '加入房间',
            'lan.join.cancel': '取消',
            'lan.join.retry': '重试',
            'lan.join.back': '返回',
            'lan.ttl.2h': '2 小时',
            'lan.ttl.8h': '8 小时',
            'lan.ttl.24h': '24 小时',
            'lan.form.placeholder.code': '例如 ABCD-2345',
            'lan.form.placeholder.address': '192.168.1.23:8787',
            'lan.form.placeholder.name': '例如 zzw-air',
            'lan.form.placeholder.room': '我的房间',
            'lan.form.required': '请填写必填项',
            'lan.invite.title': '邀请成员',
            'lan.invite.once': '一次性邀请码 · 24 小时内有效',
            'lan.invite.action': '邀请成员',
            'lan.invite.again': '再生成一张',
            'lan.invite.done': '完成',
            'lan.invite.close': '关闭',
            'lan.invite.address': '房间地址',
            'lan.invite.hint': '把邀请码或二维码发给同事，对方在「联机 → 加入房间」中填入即可。每张码只能使用一次。',
            'lan.invite.sameWifi': '同一 Wi-Fi 下可直接访问',
            'lan.invite.copyHint': '点击邀请码即可复制整串',
            'lan.invite.status.unused': '未使用',
            'lan.invite.status.used': '已使用',
            'lan.invite.status.expired': '已过期',
            'lan.invite.status.revoked': '已撤销',
            'lan.invite.usedBy': '{name} 已用',
            'lan.invite.revoke': '撤销',
            'lan.invite.generate': '＋ 生成新邀请码',
            'lan.invite.none': '还没有可用邀请码',
            'lan.room.members': '成员',
            'lan.room.invites': '邀请码',
            'lan.room.end': '结束房间',
            'lan.room.confirmEnd': '确认结束',
            'lan.room.leave': '离开房间',
            'lan.room.people': '{n}/{max} 人',
            'lan.room.left': '剩余 {time}',
            'lan.room.expiredText': '已到期',
            'lan.room.encrypted': '端到端加密',
            'lan.room.created': '房间已创建，监听 {address}',
            'lan.room.joined': '已加入房间',
            'lan.room.hostedBy': '由 {name} 主持',
            'lan.room.joinedAs': '已加入 · 由 {name} 主持',
            'lan.room.roomNo': '房间号',
            'lan.room.online': '在线',
            'lan.room.offline': '离线',
            'lan.room.busy': '处理中',
            'lan.room.host': '主持',
            'lan.room.me': '我',
            'lan.room.status.running': '运行中',
            'lan.room.status.connecting': '连接中',
            'lan.room.status.joined': '已连接',
            'lan.room.status.reconnecting': '重连中',
            'lan.room.status.disconnected': '已断开',
            'lan.room.status.closed': '已结束',
            'lan.room.closed': '房间已结束',
            'lan.room.closedHint': '房间已由主持人关闭，可以返回空态重新开房或加入别人的房间。',
            'lan.room.hostHint': '把邀请码发给同事，对方在「联机 → 加入房间」里填入即可。',
            'lan.room.hostHintAction': '去邀请 →',
            'lan.members.ask': '提问',
            'lan.ask.pending': '{name} 正在处理…',
            'lan.ask.answer': '回答',
            'lan.ask.question': '提问',
            'lan.ask.timeout': '对方未在时限内回答',
            'lan.ask.failed': '提问失败',
            'lan.ask.retry': '重试',
            'lan.ask.late': '迟到的回答',
            'lan.ask.meta': '{duration} · {steps} 步 · {model}',
            'lan.ask.duration': '{seconds}s',
            'lan.ask.toAll': '提问需要选择一个具体成员',
            'lan.composer.to': '发给',
            'lan.composer.everyone': '所有人',
            'lan.composer.ask': '提问',
            'lan.composer.send': '消息',
            'lan.composer.placeholder': '输入问题或消息…',
            'lan.composer.hint': 'Enter 发送 · ⇧Enter 换行',
            'lan.composer.askHint': '提问会由对方 agent 回答，普通消息只送达',
            'lan.composer.disabled': '连接中断，暂时无法发送',
            'lan.error.unknown': '邀请码无效',
            'lan.error.used': '邀请码已被使用',
            'lan.error.expired': '邀请码已过期',
            'lan.error.revoked': '邀请码已被撤销',
            'lan.error.unreachable': '地址不可达，请确认在同一局域网',
            'lan.error.full': '该房间已满',
            'lan.error.portUnavailable': '端口不可用，换一个端口再试',
            'lan.error.notHost': '只有主持人可以执行此操作',
            'lan.error.roomClosed': '房间已关闭',
            'lan.error.noRoom': '当前不在房间中',
            'lan.error.peerOffline': '对方不在线',
            'lan.error.tooLong': '内容过长',
            'lan.error.badRequest': '请求无效',
            'lan.error.peerUnknown': '找不到该成员',
            'lan.error.generic': '操作失败：{message}',
            'lan.copy.done': '已复制',
            'lan.copy.failed': '复制失败，请手动选择',
            'lan.notice.joined': '{name} 加入了房间',
            'lan.notice.left': '{name} 离开了房间',
            'lan.notice.closed': '房间已由主持人关闭',
            'lan.notice.reconnecting': '连接中断，正在重连…',
            'lan.notice.disconnected': '已断开连接',
            'lan.conn.broken': '连接中断',
            'lan.conn.retry': '面板正在自动重试，显示的是最后一帧快照',
            'lan.stream.today': '今天',
        }

        const EN = {
            'lan.title': 'LAN',
            'lan.loading': 'Reading room state…',
            'lan.empty.title': 'LAN rooms',
            'lan.empty.sub': 'Let agents on the same LAN talk to each other',
            'lan.empty.foot': "Works on your local network, no server needed · One-time invites · Each question is answered by the other side's agent",
            'lan.empty.start': 'Start →',
            'lan.empty.join': 'Enter an invite →',
            'lan.create.title': 'Create a room',
            'lan.create.desc': 'Host a LAN room on this machine and generate one-time invite codes.',
            'lan.create.name': 'Room name',
            'lan.create.defaultTitle': 'My room',
            'lan.create.displayName': "This machine's display name",
            'lan.create.port': 'Port',
            'lan.create.ttl': 'Valid for',
            'lan.create.action': 'Create room',
            'lan.join.title': 'Join a room',
            'lan.join.desc': 'Enter the invite code from your colleague and talk to their agent.',
            'lan.join.code': 'Invite code',
            'lan.join.address': 'Room address',
            'lan.join.address.optional': 'Optional, the QR code carries it',
            'lan.join.name': 'My display name',
            'lan.join.action': 'Join room',
            'lan.join.cancel': 'Cancel',
            'lan.join.retry': 'Retry',
            'lan.join.back': 'Back',
            'lan.ttl.2h': '2 hours',
            'lan.ttl.8h': '8 hours',
            'lan.ttl.24h': '24 hours',
            'lan.form.placeholder.code': 'e.g. ABCD-2345',
            'lan.form.placeholder.address': '192.168.1.23:8787',
            'lan.form.placeholder.name': 'e.g. zzw-air',
            'lan.form.placeholder.room': 'My room',
            'lan.form.required': 'Fill in the required fields',
            'lan.invite.title': 'Invite a member',
            'lan.invite.once': 'One-time invite · valid for 24 hours',
            'lan.invite.action': 'Invite',
            'lan.invite.again': 'Generate another',
            'lan.invite.done': 'Done',
            'lan.invite.close': 'Close',
            'lan.invite.address': 'Room address',
            'lan.invite.hint': 'Send the invite code or QR code to your colleague; they enter it under LAN → Join a room. Each code works once.',
            'lan.invite.sameWifi': 'Reachable directly on the same Wi-Fi',
            'lan.invite.copyHint': 'Click the code to copy the whole invite',
            'lan.invite.status.unused': 'Unused',
            'lan.invite.status.used': 'Used',
            'lan.invite.status.expired': 'Expired',
            'lan.invite.status.revoked': 'Revoked',
            'lan.invite.usedBy': '{name} used it',
            'lan.invite.revoke': 'Revoke',
            'lan.invite.generate': '+ Generate a new invite',
            'lan.invite.none': 'No usable invite yet',
            'lan.room.members': 'Members',
            'lan.room.invites': 'Invite codes',
            'lan.room.end': 'End room',
            'lan.room.confirmEnd': 'End it',
            'lan.room.leave': 'Leave room',
            'lan.room.people': '{n}/{max} people',
            'lan.room.left': '{time} left',
            'lan.room.expiredText': 'expired',
            'lan.room.encrypted': 'End-to-end encrypted',
            'lan.room.created': 'Room created, listening on {address}',
            'lan.room.joined': 'Joined the room',
            'lan.room.hostedBy': 'Hosted by {name}',
            'lan.room.joinedAs': 'Joined · hosted by {name}',
            'lan.room.roomNo': 'Room',
            'lan.room.online': 'online',
            'lan.room.offline': 'offline',
            'lan.room.busy': 'busy',
            'lan.room.host': 'Host',
            'lan.room.me': 'Me',
            'lan.room.status.running': 'Running',
            'lan.room.status.connecting': 'Connecting',
            'lan.room.status.joined': 'Connected',
            'lan.room.status.reconnecting': 'Reconnecting',
            'lan.room.status.disconnected': 'Disconnected',
            'lan.room.status.closed': 'Closed',
            'lan.room.closed': 'This room has ended',
            'lan.room.closedHint': 'The host closed the room. Go back to create a room or join another one.',
            'lan.room.hostHint': 'Send an invite code to a colleague; they enter it under LAN → Join a room.',
            'lan.room.hostHintAction': 'Invite →',
            'lan.members.ask': 'Ask',
            'lan.ask.pending': '{name} is working…',
            'lan.ask.answer': 'Answer',
            'lan.ask.question': 'Question',
            'lan.ask.timeout': 'No answer before the deadline',
            'lan.ask.failed': 'The question failed',
            'lan.ask.retry': 'Retry',
            'lan.ask.late': 'Late answer',
            'lan.ask.meta': '{duration} · {steps} steps · {model}',
            'lan.ask.duration': '{seconds}s',
            'lan.ask.toAll': 'Pick a specific member to ask',
            'lan.composer.to': 'To',
            'lan.composer.everyone': 'Everyone',
            'lan.composer.ask': 'Question',
            'lan.composer.send': 'Message',
            'lan.composer.placeholder': 'Type a question or a message…',
            'lan.composer.hint': 'Enter to send · ⇧Enter for a new line',
            'lan.composer.askHint': "Questions are answered by the other side's agent; plain messages are just delivered",
            'lan.composer.disabled': 'Connection lost, sending is disabled',
            'lan.error.unknown': 'This invite is invalid',
            'lan.error.used': 'This invite has already been used',
            'lan.error.expired': 'This invite has expired',
            'lan.error.revoked': 'This invite has been revoked',
            'lan.error.unreachable': 'Unreachable — check you are on the same network',
            'lan.error.full': 'This room is full',
            'lan.error.portUnavailable': 'That port is unavailable, try another one',
            'lan.error.notHost': 'Only the host can do that',
            'lan.error.roomClosed': 'The room is closed',
            'lan.error.noRoom': 'You are not in a room',
            'lan.error.peerOffline': 'That member is offline',
            'lan.error.tooLong': 'The text is too long',
            'lan.error.badRequest': 'Invalid request',
            'lan.error.peerUnknown': 'That member was not found',
            'lan.error.generic': 'Failed: {message}',
            'lan.copy.done': 'Copied',
            'lan.copy.failed': 'Copy failed, select the code manually',
            'lan.notice.joined': '{name} joined the room',
            'lan.notice.left': '{name} left the room',
            'lan.notice.closed': 'The host closed the room',
            'lan.notice.reconnecting': 'Connection lost, reconnecting…',
            'lan.notice.disconnected': 'Disconnected',
            'lan.conn.broken': 'Connection lost',
            'lan.conn.retry': 'The panel is retrying automatically; this is the last snapshot',
            'lan.stream.today': 'Today',
        }

        function fmt(template, params) {
            if (typeof template !== 'string') return ''
            if (!params) return template
            return template.replace(/\{(\w+)\}/g, function (match, name) {
                return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
            })
        }

        /** 包装 locale 服务的 t：抛错或缺键时退化为内置中文，保证不白屏。 */
        function makeT(bound) {
            return function t(key, params) {
                let text
                try {
                    if (typeof bound === 'function') text = bound(key, params)
                } catch (error) {
                    text = undefined
                }
                if (typeof text !== 'string' || text === key) {
                    const fallback = ZH[key]
                    text = typeof fallback === 'string' ? fallback : key
                }
                return fmt(text, params)
            }
        }

        /* ────────────────────────────── 主题与样式 ────────────────────────────── */

        const C = {
            bg: 'var(--dsw-alias-bg-base, #ffffff)',
            layer1: 'var(--dsw-alias-bg-layer-1, #ffffff)',
            layer2: 'var(--dsw-alias-bg-layer-2, #f4f4f6)',
            border: 'var(--dsw-alias-border-l1, #e7e7ea)',
            text: 'var(--dsw-alias-label-primary, #1b1c1f)',
            text2: 'var(--dsw-alias-label-secondary, #6b6f77)',
            brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
            ok: 'var(--dsw-alias-state-success-primary, #16a34a)',
            err: 'var(--dsw-alias-state-error-primary, #dc2626)',
            warn: 'var(--dsw-alias-state-warn-primary, #d97706)',
        }
        const OK_SOFT = 'var(--dsw-alias-state-success-secondary, #e9f7ee)'
        const ERR_SOFT = 'var(--dsw-alias-state-error-secondary, #fdecec)'
        const WARN_SOFT = 'var(--dsw-alias-state-warn-secondary, #fff7e1)'
        const WARN_TEXT = 'var(--dsw-alias-state-warn-label, #b45309)'
        const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace'
        const SHADOW = '0 1px 2px rgba(16, 24, 40, 0.04)'
        const SHADOW_LIFT = '0 2px 10px rgba(16, 24, 40, 0.06)'
        const mix = (token, percent) => `color-mix(in srgb, ${token} ${percent}%, transparent)`

        const AVATAR_GRADIENTS = [
            'linear-gradient(135deg, #4d6bfe, #6f86ff)',
            'linear-gradient(135deg, #0f9d78, #37c39b)',
            'linear-gradient(135deg, #7c5cfc, #a78bfa)',
            'linear-gradient(135deg, #d97706, #f59e0b)',
        ]

        /* ────────────────────────────── 纯函数工具 ────────────────────────────── */

        function pad2(value) {
            return String(value).padStart(2, '0')
        }

        function hhmm(ts) {
            const date = new Date(Number(ts) || Date.now())
            return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
        }

        function mmss(ms) {
            const total = Math.max(0, Math.floor(Number(ms || 0) / 1000))
            return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
        }

        function durationLabel(ms) {
            const value = Number(ms)
            if (!Number.isFinite(value) || value < 0) return '—'
            return `${(value / 1000).toFixed(1)}s`
        }

        function remainLabel(ms, t) {
            const value = Number(ms)
            if (!Number.isFinite(value)) return '—'
            if (value <= 0) return t('lan.room.expiredText')
            const totalMin = Math.floor(value / 60000)
            const hours = Math.floor(totalMin / 60)
            const mins = totalMin % 60
            return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
        }

        function groupCode(code) {
            const clean = String(code || '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
            if (clean.length <= 4) return clean
            return `${clean.slice(0, 4)}-${clean.slice(4)}`
        }

        function normalizeCodeTyping(raw) {
            const clean = String(raw || '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 8)
            return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
        }

        function initials(name) {
            const text = String(name || '').trim()
            if (!text) return '?'
            return Array.from(text).slice(0, 2).join('').toUpperCase()
        }

        function avatarStyle(seed) {
            let hash = 0
            const text = String(seed || '')
            for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 9973
            return {
                width: 30,
                height: 30,
                flex: '0 0 30px',
                borderRadius: 9,
                background: AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length],
                color: '#ffffff',
                fontSize: 11.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                userSelect: 'none',
            }
        }

        const ERROR_KEYS = {
            'invite-unknown': 'lan.error.unknown',
            'invite-used': 'lan.error.used',
            'invite-expired': 'lan.error.expired',
            'invite-revoked': 'lan.error.revoked',
            unreachable: 'lan.error.unreachable',
            'room-full': 'lan.error.full',
            'port-unavailable': 'lan.error.portUnavailable',
            'not-host': 'lan.error.notHost',
            'room-closed': 'lan.error.roomClosed',
            'no-room': 'lan.error.noRoom',
            'peer-offline': 'lan.error.peerOffline',
            'peer-unknown': 'lan.error.peerUnknown',
            'too-long': 'lan.error.tooLong',
            'invalid-argument': 'lan.error.badRequest',
        }

        function errorText(t, error) {
            const code = error && error.code
            if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code])
            const message = error && error.message ? error.message : String(error || '')
            return t('lan.error.generic', { message })
        }

        function presenceColor(status) {
            if (status === 'online') return C.ok
            if (status === 'busy') return C.warn
            return C.text2
        }

        function presenceText(t, status) {
            if (status === 'online') return t('lan.room.online')
            if (status === 'busy') return t('lan.room.busy')
            return t('lan.room.offline')
        }

        function isAskMatched(serverAsk, localAsk) {
            if (!serverAsk || !localAsk) return false
            if (localAsk.id && serverAsk.id === localAsk.id) return true
            if (String(serverAsk.text || '') !== String(localAsk.text || '')) return false
            if (String(serverAsk.to || '') !== String(localAsk.to || '')) return false
            return Math.abs(Number(serverAsk.createdAt || 0) - Number(localAsk.createdAt || 0)) < 180000
        }

        /* ────────────────────────────── 图形 ────────────────────────────── */

        const GLYPHS = {
            plus: ['M12 5v14', 'M5 12h14'],
            link: [
                'M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5',
                'M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5',
            ],
            copy: ['M9 9h10v12H9z', 'M5 15V3h10'],
            lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
            close: ['M18 6 6 18', 'M6 6l12 12'],
            ask: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
            refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
            warn: ['M12 8v5', 'M12 16h.01', 'M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
        }

        function Glyph(props) {
            const size = props.size || 14
            const paths = props.paths || []
            return h(
                'svg',
                {
                    viewBox: '0 0 24 24',
                    width: size,
                    height: size,
                    fill: 'none',
                    stroke: props.color || 'currentColor',
                    strokeWidth: props.weight || 1.8,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    'aria-hidden': 'true',
                    focusable: 'false',
                    style: { display: 'block', flex: '0 0 auto' },
                },
                paths.map((path, index) => h('path', { key: index, d: path })),
            )
        }

        function Icon(props) {
            return h(Glyph, { size: props.size || 14, paths: GLYPHS[props.name] || [], color: props.color, weight: props.weight })
        }

        function GlobeGlyph(props) {
            const size = props.size || 18
            return h(
                'svg',
                {
                    viewBox: '0 0 24 24',
                    width: size,
                    height: size,
                    fill: 'none',
                    stroke: props.color || 'currentColor',
                    strokeWidth: 1.7,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    'aria-hidden': 'true',
                    focusable: 'false',
                    style: { display: 'block', flex: '0 0 auto' },
                },
                h('circle', { key: 'c', cx: 12, cy: 12, r: 9 }),
                h('path', { key: 'h', d: 'M3 12h18' }),
                h('path', { key: 'm', d: 'M12 3c2.6 2.7 4 5.9 4 9s-1.4 6.3-4 9c-2.6-2.7-4-5.9-4-9s1.4-6.3 4-9z' }),
            )
        }

        /** 侧边栏图钉：ownerProps = { size, active }。 */
        function PinIcon(props) {
            const size = (props && props.size) || 18
            const active = Boolean(props && props.active)
            return h(GlobeGlyph, { size, color: active ? 'var(--dsw-alias-brand-primary, currentColor)' : 'currentColor' })
        }

        function Spinner(props) {
            const size = props.size || 11
            return h(
                'svg',
                { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', style: { display: 'inline-block', flex: '0 0 auto' } },
                h('circle', { cx: 12, cy: 12, r: 9, fill: 'none', stroke: mix(C.brand, 22), strokeWidth: 3 }),
                h(
                    'path',
                    { d: 'M12 3a9 9 0 0 1 9 9', fill: 'none', stroke: C.brand, strokeWidth: 3, strokeLinecap: 'round' },
                    h('animateTransform', {
                        attributeName: 'transform',
                        type: 'rotate',
                        from: '0 12 12',
                        to: '360 12 12',
                        dur: '0.9s',
                        repeatCount: 'indefinite',
                    }),
                ),
            )
        }

        function Dot(props) {
            const size = props.size || 8
            return h('span', {
                style: {
                    width: size,
                    height: size,
                    flex: '0 0 auto',
                    borderRadius: '50%',
                    background: props.color || C.ok,
                    boxShadow: props.ring ? `0 0 0 3px ${props.ring}` : 'none',
                    display: 'inline-block',
                },
            })
        }

        /* ────────────────────────────── 基础控件 ────────────────────────────── */

        function useHover() {
            const [hovered, setHovered] = useState(false)
            const bind = useMemo(
                () => ({
                    onMouseEnter: () => setHovered(true),
                    onMouseLeave: () => setHovered(false),
                }),
                [],
            )
            return [hovered, bind]
        }

        function Btn(props) {
            const [hovered, hoverBind] = useHover()
            const kind = props.kind || 'ghost'
            const disabled = Boolean(props.disabled)
            const base = {
                height: props.height || 32,
                boxSizing: 'border-box',
                borderRadius: 8,
                fontSize: props.small ? 11 : 12.5,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: props.small ? '0 8px' : '0 13px',
                whiteSpace: 'nowrap',
                lineHeight: 1,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'background 120ms ease, border-color 120ms ease',
            }
            let skin
            if (kind === 'primary') {
                skin = {
                    border: `1px solid ${C.brand}`,
                    background: hovered && !disabled ? `color-mix(in srgb, ${C.brand} 86%, #000000)` : C.brand,
                    color: '#ffffff',
                    fontWeight: 500,
                    boxShadow: `0 1px 2px ${mix(C.brand, 28)}`,
                }
            } else if (kind === 'outline') {
                skin = {
                    border: `1px solid ${C.border}`,
                    background: hovered && !disabled ? C.layer2 : C.layer1,
                    color: C.text,
                }
            } else if (kind === 'danger') {
                skin = {
                    border: '1px solid transparent',
                    background: hovered && !disabled ? ERR_SOFT : 'transparent',
                    color: C.err,
                }
            } else {
                skin = {
                    border: '1px solid transparent',
                    background: hovered && !disabled ? C.layer2 : 'transparent',
                    color: C.text2,
                }
            }
            return h(
                'button',
                Object.assign(
                    {
                        type: 'button',
                        disabled,
                        onClick: disabled ? undefined : props.onClick,
                        title: props.title,
                        'aria-label': props['aria-label'] || props.title,
                    },
                    hoverBind,
                    { style: Object.assign({}, base, skin, props.style || {}) },
                ),
                props.children,
            )
        }

        function TextInput(props) {
            const [focused, setFocused] = useState(false)
            const invalid = Boolean(props.invalid)
            return h('input', {
                ref: props.inputRef,
                type: props.type || 'text',
                value: props.value,
                placeholder: props.placeholder,
                disabled: props.disabled,
                inputMode: props.inputMode,
                autoComplete: 'off',
                spellCheck: false,
                onChange: (event) => props.onChange(event.target.value, event),
                onFocus: () => setFocused(true),
                onBlur: () => setFocused(false),
                onKeyDown: props.onKeyDown,
                style: {
                    width: '100%',
                    height: 36,
                    boxSizing: 'border-box',
                    borderRadius: 8,
                    padding: '0 11px',
                    fontSize: 13,
                    fontFamily: props.mono ? MONO : 'inherit',
                    letterSpacing: props.mono ? 1.2 : undefined,
                    color: C.text,
                    background: C.layer1,
                    border: `1px solid ${invalid ? C.err : focused ? C.brand : C.border}`,
                    outline: 'none',
                    boxShadow: focused ? `0 0 0 3px ${mix(C.brand, 12)}` : 'none',
                },
            })
        }

        function Select(props) {
            return h(
                'select',
                {
                    value: props.value,
                    disabled: props.disabled,
                    onChange: (event) => props.onChange(event.target.value),
                    'aria-label': props['aria-label'],
                    style: {
                        height: 32,
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.layer1,
                        color: C.text,
                        fontSize: 12.5,
                        fontFamily: 'inherit',
                        padding: '0 8px',
                        outline: 'none',
                        cursor: props.disabled ? 'default' : 'pointer',
                    },
                },
                props.options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
            )
        }

        function Field(props) {
            return h(
                'div',
                { style: { marginBottom: 13 } },
                h(
                    'div',
                    {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            fontSize: 11,
                            color: C.text2,
                            marginBottom: 6,
                        },
                    },
                    h('span', null, props.label),
                    props.hint
                        ? h('span', { style: { color: C.text2, opacity: 0.72, fontSize: 10, whiteSpace: 'nowrap' } }, props.hint)
                        : null,
                ),
                props.children,
            )
        }

        function Chip(props) {
            const tone = props.tone
            let skin
            if (tone === 'ok') skin = { background: OK_SOFT, color: C.ok }
            else if (tone === 'warn') skin = { background: WARN_SOFT, color: WARN_TEXT }
            else if (tone === 'err') skin = { background: ERR_SOFT, color: C.err }
            else skin = { background: C.layer2, color: C.text2 }
            return h(
                'div',
                {
                    style: Object.assign(
                        {
                            height: 26,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '0 10px',
                            borderRadius: 999,
                            fontSize: 11.5,
                            whiteSpace: 'nowrap',
                        },
                        skin,
                    ),
                },
                props.children,
            )
        }

        /* ────────────────────────────── 表单外壳 ────────────────────────────── */

        function FormErrorBar(props) {
            const t = props.t
            const error = props.error || {}
            const text =
                error.code && ERROR_KEYS[error.code]
                    ? t(ERROR_KEYS[error.code])
                    : error.code === 'required'
                      ? error.message
                      : errorText(t, error)
            return h(
                'div',
                {
                    style: {
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        border: `1px solid ${mix(C.err, 28)}`,
                        background: ERR_SOFT,
                        color: C.err,
                        borderRadius: 10,
                        padding: '9px 11px',
                        fontSize: 11.5,
                        lineHeight: 1.6,
                        marginBottom: 14,
                    },
                },
                h('span', { style: { marginTop: 1 } }, h(Icon, { name: 'warn', size: 13 })),
                h('span', { style: { flex: 1 } }, text),
            )
        }

        function FormShell(props) {
            return h(
                'div',
                {
                    style: {
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        padding: '40px 24px',
                    },
                },
                h(
                    'div',
                    {
                        style: {
                            width: '100%',
                            maxWidth: 470,
                            border: `1px solid ${C.border}`,
                            borderRadius: 14,
                            background: C.layer1,
                            boxShadow: SHADOW_LIFT,
                            padding: 20,
                            boxSizing: 'border-box',
                        },
                    },
                    h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, props.title),
                    h('div', { style: { fontSize: 11.5, color: C.text2, marginBottom: 16, lineHeight: 1.6 } }, props.desc),
                    props.error ? h(FormErrorBar, { t: props.t, error: props.error }) : null,
                    props.children,
                ),
            )
        }

        /* ────────────────────────────── 空态 ────────────────────────────── */

        function EntryCard(props) {
            const [hovered, hoverBind] = useHover()
            return h(
                'button',
                Object.assign(
                    {
                        type: 'button',
                        onClick: props.onClick,
                    },
                    hoverBind,
                    {
                        style: {
                            width: 300,
                            textAlign: 'left',
                            border: `1px solid ${props.primary ? mix(C.brand, 35) : C.border}`,
                            borderRadius: 14,
                            background: props.primary ? mix(C.brand, 5) : C.layer1,
                            boxShadow: hovered ? SHADOW_LIFT : SHADOW,
                            padding: 18,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            color: C.text,
                            transition: 'box-shadow 120ms ease, border-color 120ms ease',
                        },
                    },
                ),
                h(
                    'div',
                    {
                        style: {
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: props.primary ? mix(C.brand, 12) : C.layer2,
                            color: props.primary ? C.brand : C.text2,
                            marginBottom: 12,
                        },
                    },
                    props.primary ? h(GlobeGlyph, { size: 17 }) : h(Icon, { name: 'link', size: 16 }),
                ),
                h('div', { style: { fontSize: 13.5, fontWeight: 600, marginBottom: 6 } }, props.title),
                h('div', { style: { fontSize: 11.5, lineHeight: 1.7, color: C.text2, minHeight: 40 } }, props.desc),
                h('div', { style: { marginTop: 10, fontSize: 12, fontWeight: 500, color: props.primary ? C.brand : C.text2 } }, props.action),
            )
        }

        function EmptyView(props) {
            const t = props.t
            return h(
                'div',
                {
                    style: {
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 22,
                        padding: '24px 40px 40px',
                    },
                },
                h(
                    'div',
                    { style: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' } },
                    h(EntryCard, {
                        key: 'create',
                        primary: true,
                        title: t('lan.create.title'),
                        desc: t('lan.create.desc'),
                        action: t('lan.empty.start'),
                        onClick: props.onCreate,
                    }),
                    h(EntryCard, {
                        key: 'join',
                        title: t('lan.join.title'),
                        desc: t('lan.join.desc'),
                        action: t('lan.empty.join'),
                        onClick: props.onJoin,
                    }),
                ),
                h('div', { style: { maxWidth: 560, textAlign: 'center', fontSize: 11, lineHeight: 1.8, color: C.text2 } }, t('lan.empty.foot')),
            )
        }

        /* ────────────────────────────── 创建 / 加入表单 ────────────────────────────── */

        function CreateForm(props) {
            const t = props.t
            const [title, setTitle] = useState(() => t('lan.create.defaultTitle'))
            const [displayName, setDisplayName] = useState(props.defaultName || '')
            const [port, setPort] = useState('8787')
            const [ttl, setTtl] = useState('480')
            const busy = props.busy === 'create'
            return h(
                FormShell,
                {
                    t,
                    title: t('lan.create.title'),
                    desc: t('lan.create.desc'),
                    error: props.error,
                },
                h(Field, { label: t('lan.create.name') }, h(TextInput, {
                    value: title,
                    onChange: setTitle,
                    placeholder: t('lan.form.placeholder.room'),
                    disabled: busy,
                })),
                h(Field, { label: t('lan.create.displayName') }, h(TextInput, {
                    value: displayName,
                    onChange: setDisplayName,
                    placeholder: t('lan.form.placeholder.name'),
                    disabled: busy,
                })),
                h(
                    'div',
                    { style: { display: 'flex', gap: 12 } },
                    h(
                        'div',
                        { style: { width: 120, flex: '0 0 120px' } },
                        h(Field, { label: t('lan.create.port') }, h(TextInput, {
                            value: port,
                            onChange: (value) => setPort(String(value).replace(/[^0-9]/g, '').slice(0, 5)),
                            inputMode: 'numeric',
                            disabled: busy,
                        })),
                    ),
                    h(
                        'div',
                        { style: { flex: 1, minWidth: 0 } },
                        h(Field, { label: t('lan.create.ttl') }, h(Select, {
                            value: ttl,
                            onChange: setTtl,
                            disabled: busy,
                            options: [
                                { value: '120', label: t('lan.ttl.2h') },
                                { value: '480', label: t('lan.ttl.8h') },
                                { value: '1440', label: t('lan.ttl.24h') },
                            ],
                        })),
                    ),
                ),
                h(
                    'div',
                    { style: { display: 'flex', gap: 8, marginTop: 6 } },
                    h(
                        Btn,
                        {
                            kind: 'primary',
                            style: { flex: 1 },
                            disabled: busy,
                            onClick: () => props.onSubmit({ title, displayName, port, ttlMinutes: ttl }),
                        },
                        busy ? h(Spinner, { size: 12 }) : null,
                        t('lan.create.action'),
                    ),
                    h(Btn, { kind: 'ghost', disabled: busy, onClick: props.onCancel }, t('lan.join.cancel')),
                ),
            )
        }

        function JoinForm(props) {
            const t = props.t
            const [code, setCode] = useState('')
            const [address, setAddress] = useState('')
            const [displayName, setDisplayName] = useState(props.defaultName || '')
            const busy = props.busy === 'join'
            const invalid = Boolean(props.error && props.error.code && props.error.code !== 'required')
            return h(
                FormShell,
                {
                    t,
                    title: t('lan.join.title'),
                    desc: t('lan.join.desc'),
                    error: props.error,
                },
                h(Field, { label: t('lan.join.code') }, h(TextInput, {
                    value: code,
                    onChange: (value) => setCode(normalizeCodeTyping(value)),
                    placeholder: t('lan.form.placeholder.code'),
                    mono: true,
                    invalid,
                    disabled: busy,
                })),
                h(
                    Field,
                    { label: t('lan.join.address'), hint: t('lan.join.address.optional') },
                    h(TextInput, {
                        value: address,
                        onChange: setAddress,
                        placeholder: t('lan.form.placeholder.address'),
                        mono: true,
                        disabled: busy,
                    }),
                ),
                h(Field, { label: t('lan.join.name') }, h(TextInput, {
                    value: displayName,
                    onChange: setDisplayName,
                    placeholder: t('lan.form.placeholder.name'),
                    disabled: busy,
                })),
                h(
                    'div',
                    { style: { display: 'flex', gap: 8, marginTop: 6 } },
                    h(
                        Btn,
                        {
                            kind: 'primary',
                            style: { flex: 1 },
                            disabled: busy,
                            onClick: () => props.onSubmit({ code, address, displayName }),
                        },
                        busy ? h(Spinner, { size: 12 }) : null,
                        props.error ? t('lan.join.retry') : t('lan.join.action'),
                    ),
                    h(Btn, { kind: 'ghost', disabled: busy, onClick: props.onCancel }, t('lan.join.cancel')),
                ),
            )
        }

        /* ────────────────────────────── 成员行 ────────────────────────────── */

        function MemberRow(props) {
            const t = props.t
            const member = props.member
            const [hovered, hoverBind] = useHover()
            const isSelf = Boolean(member.isSelf) || member.peerId === props.selfPeerId
            return h(
                'div',
                Object.assign(
                    {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 9,
                            padding: 8,
                            borderRadius: 10,
                            background: hovered ? C.layer2 : 'transparent',
                        },
                    },
                    hoverBind,
                ),
                h('div', { style: avatarStyle(member.peerId) }, initials(member.name)),
                h(
                    'div',
                    { style: { minWidth: 0, flex: 1 } },
                    h(
                        'div',
                        { style: { fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' } },
                        h(
                            'span',
                            { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 } },
                            member.name || '—',
                        ),
                        member.isHost
                            ? h(
                                  'span',
                                  {
                                      style: {
                                          fontSize: 9.5,
                                          padding: '1px 5px',
                                          borderRadius: 4,
                                          background: mix(C.brand, 9),
                                          color: C.brand,
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                      },
                                  },
                                  t('lan.room.host'),
                              )
                            : null,
                        isSelf
                            ? h(
                                  'span',
                                  {
                                      style: {
                                          fontSize: 9.5,
                                          padding: '1px 5px',
                                          borderRadius: 4,
                                          background: C.layer2,
                                          color: C.text2,
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                      },
                                  },
                                  t('lan.room.me'),
                              )
                            : null,
                    ),
                    h(
                        'div',
                        { style: { fontSize: 11, color: C.text2, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 } },
                        h(Dot, { size: 6, color: presenceColor(member.status) }),
                        h(
                            'span',
                            { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                            `${member.platform || '—'} · ${presenceText(t, member.status)}`,
                        ),
                    ),
                ),
                !isSelf && !props.closed
                    ? h(
                          'div',
                          {
                              style: {
                                  marginLeft: 'auto',
                                  display: 'flex',
                                  gap: 2,
                                  opacity: hovered ? 1 : 0,
                                  transition: 'opacity 120ms ease',
                              },
                          },
                          h(
                              Btn,
                              { small: true, title: t('lan.members.ask'), onClick: () => props.onAsk(member) },
                              h(Icon, { name: 'ask', size: 13 }),
                              t('lan.members.ask'),
                          ),
                      )
                    : null,
            )
        }

        /* ────────────────────────────── 主页面 ────────────────────────────── */

        function Page(props) {
            const t = makeT(props && props.t)
            const rootRef = useRef(null)
            const scrollRef = useRef(null)
            const taRef = useRef(null)

            const [snap, setSnap] = useState(null)
            const [connBroken, setConnBroken] = useState(false)
            const [tick, setTick] = useState(0)
            const [now, setNow] = useState(() => Date.now())
            const [view, setView] = useState('empty')
            const [busy, setBusy] = useState(null)
            const [formError, setFormError] = useState(null)
            const [inviteOpen, setInviteOpen] = useState(false)
            const [inviteBusy, setInviteBusy] = useState(false)
            const [toast, setToast] = useState(null)
            const [draft, setDraft] = useState('')
            const [target, setTarget] = useState('all')
            const [mode, setMode] = useState('message')
            const [confirmEnd, setConfirmEnd] = useState(false)
            const [pendingAsks, setPendingAsks] = useState([])

            /* 轮询 /state：失败保留上一份快照并标记连接中断 */
            useEffect(() => {
                let alive = true
                let timer = 0
                let controller = null
                const load = async () => {
                    if (controller) controller.abort()
                    controller = new AbortController()
                    try {
                        const response = await fetch(STATE_PATH, {
                            signal: controller.signal,
                            headers: { accept: 'application/json' },
                        })
                        const payload = await response.json()
                        if (!alive) return
                        if (payload && payload.ok === true && payload.data) {
                            setSnap(payload.data)
                            setConnBroken(false)
                        } else {
                            setConnBroken(true)
                        }
                    } catch (error) {
                        if (alive) setConnBroken(true)
                    }
                    if (alive) timer = setTimeout(load, POLL_MS)
                }
                load()
                return () => {
                    alive = false
                    clearTimeout(timer)
                    if (controller) controller.abort()
                }
            }, [tick])

            /* 秒级时钟：剩余时间 / 提问计时 */
            useEffect(() => {
                const id = setInterval(() => setNow(Date.now()), 1000)
                return () => clearInterval(id)
            }, [])

            /* toast 自动消失 */
            useEffect(() => {
                if (!toast) return undefined
                const id = setTimeout(() => setToast(null), 2200)
                return () => clearTimeout(id)
            }, [toast])

            /* Esc 关闭邀请弹窗 */
            useEffect(() => {
                if (!inviteOpen) return undefined
                const onKey = (event) => {
                    if (event.key === 'Escape') setInviteOpen(false)
                }
                window.addEventListener('keydown', onKey)
                return () => window.removeEventListener('keydown', onKey)
            }, [inviteOpen])

            const refresh = () => setTick((value) => value + 1)

            const call = async (path, body) => {
                const options =
                    body === undefined
                        ? { headers: { accept: 'application/json' } }
                        : {
                              method: 'POST',
                              headers: { 'content-type': 'application/json', accept: 'application/json' },
                              body: JSON.stringify(body),
                          }
                const response = await fetch(`${API_BASE}${path}`, options)
                let payload = null
                try {
                    payload = await response.json()
                } catch (error) {
                    payload = null
                }
                if (!payload || payload.ok !== true) {
                    const detail = (payload && payload.error) || {}
                    const error = new Error(detail.message || `HTTP ${response.status}`)
                    error.code = detail.code || `http-${response.status}`
                    throw error
                }
                return payload.data
            }

            const pushToast = (text, ok) => setToast({ text, ok: Boolean(ok), at: Date.now() })

            const role = (snap && snap.role) || 'idle'
            const room = (snap && snap.room) || null
            const self = (snap && snap.self) || { peerId: 'host', name: '', platform: '' }
            const members = Array.isArray(snap && snap.members) ? snap.members : []
            const invites = Array.isArray(snap && snap.invites) ? snap.invites : []
            const messages = Array.isArray(snap && snap.messages) ? snap.messages : []
            const serverAsks = Array.isArray(snap && snap.asks) ? snap.asks : []
            const isHost = role === 'host'
            const isGuest = role === 'guest'
            const roomStatus = (room && room.status) || ''
            const connecting = isGuest && roomStatus === 'connecting'
            const reconnecting = isGuest && (roomStatus === 'reconnecting' || roomStatus === 'disconnected')
            const closed = Boolean(snap) && (roomStatus === 'closed' || ((isHost || isGuest) && !room))

            const names = useMemo(() => {
                const map = {}
                for (const member of members) map[member.peerId] = member.name
                if (self && self.peerId) map[self.peerId] = self.name || map[self.peerId]
                if (room && room.hostName) map.host = map.host || room.hostName
                return map
            }, [members, self, room])

            /* 服务端 asks 到达后移除本地占位卡（按 id 或 文本+对象+时间 去重） */
            useEffect(() => {
                if (!snap) return
                setPendingAsks((previous) => {
                    if (!previous.length) return previous
                    const next = previous.filter((local) => !serverAsks.some((server) => isAskMatched(server, local)))
                    return next.length === previous.length ? previous : next
                })
            }, [snap, serverAsks])

            /* 成员离开后把发送对象落回「所有人」 */
            useEffect(() => {
                if (target === 'all') return
                if (!members.some((member) => member.peerId === target)) setTarget('all')
            }, [members, target])

            /* 进入/离开房间时重置页内状态 */
            useEffect(() => {
                if (role === 'idle') {
                    setView('empty')
                    setConfirmEnd(false)
                    setInviteOpen(false)
                    setPendingAsks([])
                } else {
                    setFormError(null)
                }
            }, [role])

            const asks = useMemo(() => {
                const merged = serverAsks.slice()
                for (const local of pendingAsks) merged.push(local)
                merged.sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
                return merged
            }, [serverAsks, pendingAsks])

            const streamItems = useMemo(() => {
                const items = []
                for (const message of messages) items.push({ type: 'message', at: Number(message.ts) || 0, message })
                for (const ask of asks) items.push({ type: 'ask', at: Number(ask.createdAt) || 0, ask })
                items.sort((left, right) => left.at - right.at)
                return items
            }, [messages, asks])

            /* 消息流贴底 */
            useEffect(() => {
                const node = scrollRef.current
                if (node) node.scrollTop = node.scrollHeight
            }, [snap, pendingAsks])

            const copyFallback = (text) => {
                const host = rootRef.current
                if (!host) return false
                const area = document.createElement('textarea')
                area.value = text
                area.setAttribute('readonly', '')
                area.style.position = 'absolute'
                area.style.left = '-9999px'
                area.style.top = '0'
                host.appendChild(area)
                let ok = false
                try {
                    area.select()
                    ok = document.execCommand('copy')
                } catch (error) {
                    ok = false
                }
                try {
                    host.removeChild(area)
                } catch (error) {
                    /* ignore */
                }
                return ok
            }

            const copyText = async (text) => {
                try {
                    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                        await navigator.clipboard.writeText(text)
                        return true
                    }
                } catch (error) {
                    /* 退化到 execCommand */
                }
                return copyFallback(text)
            }

            const copyInvite = async (code) => {
                const ok = await copyText(groupCode(code))
                pushToast(ok ? t('lan.copy.done') : t('lan.copy.failed'), ok)
            }

            const focusComposer = () => {
                const node = taRef.current
                if (!node) return
                try {
                    node.focus()
                } catch (error) {
                    /* ignore */
                }
            }

            async function doCreate(form) {
                if (busy) return
                setBusy('create')
                setFormError(null)
                try {
                    await call('/create', {
                        title: form.title,
                        displayName: form.displayName,
                        port: Number(form.port) || 8787,
                        ttlMinutes: Number(form.ttlMinutes) || 480,
                    })
                    setView('empty')
                    refresh()
                } catch (error) {
                    setFormError({ code: error.code, message: error.message })
                } finally {
                    setBusy(null)
                }
            }

            async function doJoin(form) {
                if (busy) return
                if (!String(form.code || '').trim()) {
                    setFormError({ code: 'required', message: t('lan.form.required') })
                    return
                }
                setBusy('join')
                setFormError(null)
                try {
                    const body = { code: form.code }
                    if (String(form.address || '').trim()) body.address = String(form.address).trim()
                    if (String(form.displayName || '').trim()) body.displayName = String(form.displayName).trim()
                    await call('/join', body)
                    setView('empty')
                    refresh()
                } catch (error) {
                    setFormError({ code: error.code, message: error.message })
                } finally {
                    setBusy(null)
                }
            }

            async function doLeave() {
                if (busy) return
                setBusy('leave')
                try {
                    await call('/leave', {})
                    setInviteOpen(false)
                    setConfirmEnd(false)
                    refresh()
                } catch (error) {
                    pushToast(errorText(t, error), false)
                } finally {
                    setBusy(null)
                }
            }

            async function doInvite() {
                if (inviteBusy) return
                setInviteBusy(true)
                try {
                    await call('/invite', { count: 1, ttlMinutes: 1440 })
                    refresh()
                } catch (error) {
                    pushToast(errorText(t, error), false)
                } finally {
                    setInviteBusy(false)
                }
            }

            async function doRevoke(inviteId) {
                try {
                    await call('/revokeInvite', { inviteId })
                    refresh()
                } catch (error) {
                    pushToast(errorText(t, error), false)
                }
            }

            async function doSubmit() {
                if (busy) return
                const text = draft.trim()
                if (!text) return
                if (mode === 'ask' && target === 'all') {
                    pushToast(t('lan.ask.toAll'), false)
                    return
                }
                setBusy('send')
                try {
                    if (mode === 'ask') {
                        const data = await call('/ask', { to: target, text })
                        const id = (data && data.askId) || `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                        setPendingAsks((previous) =>
                            previous.concat({
                                id,
                                from: self.peerId || 'host',
                                to: target,
                                text,
                                status: 'pending',
                                createdAt: Date.now(),
                                answeredAt: null,
                                answer: null,
                                meta: null,
                            }),
                        )
                    } else {
                        await call('/send', { to: target === 'all' ? 'all' : target, text })
                    }
                    setDraft('')
                    refresh()
                } catch (error) {
                    pushToast(errorText(t, error), false)
                } finally {
                    setBusy(null)
                }
            }

            function onComposerKeyDown(event) {
                if (event.key !== 'Enter' || event.shiftKey) return
                if (event.nativeEvent && event.nativeEvent.isComposing) return
                event.preventDefault()
                doSubmit()
            }

            function askMember(member) {
                setTarget(member.peerId)
                setMode('ask')
                focusComposer()
            }

            /* ── 局部渲染（含 hooks 的已抽成组件） ── */

            function renderRoomBar() {
                const people = members.length
                const limit = (room && room.memberLimit) || (snap && snap.memberLimit) || 8
                const remaining = room && room.expiresAt ? remainLabel(room.expiresAt - now, t) : '—'
                const title = isHost
                    ? (room && room.title) || t('lan.create.defaultTitle')
                    : t('lan.room.joinedAs', { name: (room && room.hostName) || '—' })
                const sub = `${t('lan.room.roomNo')} ${(room && room.id) || '—'} · ${(room && room.address) || '—'}`
                const dotColor = closed ? C.text2 : reconnecting ? C.warn : roomStatus === 'joined' || isHost ? C.ok : C.warn
                let endSlot
                if (isHost) {
                    if (confirmEnd) {
                        endSlot = h(
                            'div',
                            { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                            h(Btn, { kind: 'danger', small: true, disabled: busy === 'leave', onClick: doLeave }, t('lan.room.confirmEnd')),
                            h(Btn, { kind: 'ghost', small: true, disabled: busy === 'leave', onClick: () => setConfirmEnd(false) }, t('lan.join.cancel')),
                        )
                    } else {
                        endSlot = h(Btn, { kind: 'ghost', onClick: () => setConfirmEnd(true) }, t('lan.room.end'))
                    }
                } else {
                    endSlot = h(Btn, { kind: 'ghost', disabled: busy === 'leave', onClick: doLeave }, t('lan.room.leave'))
                }
                return h(
                    'div',
                    {
                        style: {
                            marginTop: 16,
                            border: `1px solid ${C.border}`,
                            borderRadius: 14,
                            background: C.layer1,
                            boxShadow: SHADOW,
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            flexWrap: 'wrap',
                        },
                    },
                    h(Dot, { color: dotColor, ring: mix(dotColor, 18) }),
                    h(
                        'div',
                        { style: { minWidth: 180, flex: '1 1 auto' } },
                        h('div', { style: { fontSize: 13.5, fontWeight: 600 } }, title),
                        h('div', { style: { fontSize: 11.5, color: C.text2, marginTop: 3, fontFamily: MONO, letterSpacing: 0.1 } }, sub),
                    ),
                    h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto', flexWrap: 'wrap' } },
                        h(Chip, null, t('lan.room.people', { n: people, max: limit })),
                        h(Chip, null, t('lan.room.left', { time: remaining })),
                        h(Chip, { tone: 'ok' }, h(Icon, { name: 'lock', size: 11, weight: 2.2 }), t('lan.room.encrypted')),
                        endSlot,
                    ),
                )
            }

            function inviteStatusBadge(invite) {
                const status = invite.status || 'unused'
                if (status === 'unused') return h(Chip, { tone: 'ok' }, t('lan.invite.status.unused'))
                if (status === 'used') {
                    const label = invite.usedBy ? t('lan.invite.usedBy', { name: invite.usedBy }) : t('lan.invite.status.used')
                    return h(Chip, null, label)
                }
                if (status === 'expired') return h(Chip, null, t('lan.invite.status.expired'))
                if (status === 'revoked') return h(Chip, null, t('lan.invite.status.revoked'))
                return h(Chip, null, String(status))
            }

            function renderInvites() {
                if (!isHost) return null
                const unused = invites.filter((invite) => invite.status === 'unused').length
                const rows = invites.slice().sort((left, right) => Number(right.expiresAt) - Number(left.expiresAt))
                return h(
                    'div',
                    { style: { marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 } },
                    h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                color: C.text2,
                                padding: '6px 4px 8px',
                            },
                        },
                        h('span', null, t('lan.room.invites')),
                        h(
                            'span',
                            { style: { fontWeight: 500, background: C.layer2, borderRadius: 999, padding: '0 6px', fontSize: 10 } },
                            `${unused}/${invites.length}`,
                        ),
                    ),
                    rows.map((invite) =>
                        h(
                            'div',
                            { key: invite.inviteId, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' } },
                            h(
                                'button',
                                {
                                    type: 'button',
                                    title: t('lan.invite.copyHint'),
                                    onClick: () => copyInvite(invite.code),
                                    style: {
                                        border: 0,
                                        background: 'transparent',
                                        padding: 0,
                                        fontFamily: MONO,
                                        fontSize: 12,
                                        letterSpacing: 0.6,
                                        color: invite.status === 'unused' ? C.text : C.text2,
                                        textDecoration: invite.status === 'used' ? 'line-through' : 'none',
                                        cursor: 'pointer',
                                    },
                                },
                                groupCode(invite.code),
                            ),
                            h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 } }, inviteStatusBadge(invite)),
                            invite.status === 'unused'
                                ? h(Btn, { small: true, title: t('lan.invite.revoke'), onClick: () => doRevoke(invite.inviteId) }, t('lan.invite.revoke'))
                                : null,
                        ),
                    ),
                    h(
                        'button',
                        {
                            type: 'button',
                            onClick: doInvite,
                            disabled: inviteBusy,
                            style: {
                                marginTop: 6,
                                width: '100%',
                                height: 30,
                                borderRadius: 8,
                                border: `1px dashed ${C.border}`,
                                background: 'transparent',
                                color: C.text2,
                                fontSize: 11.5,
                                fontFamily: 'inherit',
                                cursor: inviteBusy ? 'default' : 'pointer',
                                opacity: inviteBusy ? 0.6 : 1,
                            },
                        },
                        t('lan.invite.generate'),
                    ),
                )
            }

            function renderMembersPanel() {
                return h(
                    'div',
                    {
                        style: {
                            width: 236,
                            flex: '0 0 236px',
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            overflowY: 'auto',
                            paddingBottom: 8,
                        },
                    },
                    h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                color: C.text2,
                                padding: '6px 4px 8px',
                            },
                        },
                        h('span', null, t('lan.room.members')),
                        h('span', { style: { fontWeight: 500, background: C.layer2, borderRadius: 999, padding: '0 6px', fontSize: 10 } }, members.length),
                    ),
                    members.map((member) =>
                        h(MemberRow, {
                            key: member.peerId,
                            t,
                            member,
                            selfPeerId: self.peerId,
                            closed,
                            onAsk: askMember,
                        }),
                    ),
                    renderInvites(),
                )
            }

            function renderMessage(message) {
                if (message.kind === 'system') {
                    return h(
                        'div',
                        { key: `m_${message.id}`, style: { textAlign: 'center', fontSize: 11.5, color: C.text2, padding: '2px 0' } },
                        message.text,
                    )
                }
                const from = names[message.from] || message.from
                const to = message.to === 'all' ? t('lan.composer.everyone') : names[message.to] || message.to
                return h(
                    'div',
                    {
                        key: `m_${message.id}`,
                        style: { border: `1px solid ${C.border}`, borderRadius: 12, background: C.layer1, overflow: 'hidden' },
                    },
                    h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '9px 13px',
                                borderBottom: '1px solid rgba(0, 0, 0, 0.045)',
                                background: 'rgba(248, 249, 251, 0.6)',
                                fontSize: 11.5,
                                color: C.text2,
                            },
                        },
                        h('span', { style: { fontWeight: 600, color: C.text } }, from),
                        h('span', null, '→'),
                        h('span', { style: { fontWeight: 600, color: C.text } }, to),
                        h('span', { style: { marginLeft: 'auto', fontSize: 10.5 } }, `${t('lan.composer.send')} · ${hhmm(message.ts)}`),
                    ),
                    h(
                        'div',
                        {
                            style: {
                                padding: '11px 13px',
                                fontSize: 13,
                                lineHeight: 1.65,
                                color: C.text,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            },
                        },
                        message.text,
                    ),
                )
            }

            function renderAsk(ask) {
                const from = names[ask.from] || ask.from
                const toName = ask.to === 'all' ? t('lan.composer.everyone') : names[ask.to] || ask.to
                const status = ask.status || 'pending'
                const pending = status === 'pending'
                const answered = status === 'ok'
                const failed = status === 'timeout' || status === 'error'
                const elapsedMs = (ask.answeredAt || now) - (ask.createdAt || now)
                const meta = ask.meta || null
                let headerRight
                if (pending) headerRight = `${t('lan.ask.question')} · ${hhmm(ask.createdAt)}`
                else if (answered) headerRight = `${t('lan.ask.answer')} · ${durationLabel(meta && meta.durationMs ? meta.durationMs : elapsedMs)}`
                else headerRight = t('lan.ask.question')
                let footer = null
                if (pending) {
                    footer = h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                        h(Spinner, { size: 11 }),
                        h('span', null, t('lan.ask.pending', { name: toName })),
                        h('span', { style: { marginLeft: 'auto', fontFamily: MONO } }, mmss(elapsedMs)),
                    )
                } else if (answered) {
                    const duration = durationLabel(meta && meta.durationMs ? meta.durationMs : elapsedMs)
                    const steps = meta && meta.steps ? String(meta.steps) : ''
                    const model = meta && meta.model ? String(meta.model) : ''
                    footer = h(
                        'span',
                        null,
                        steps && model ? t('lan.ask.meta', { duration, steps, model }) : duration,
                        meta && meta.late ? h('span', { style: { marginLeft: 8, color: C.warn } }, t('lan.ask.late')) : null,
                    )
                } else if (failed) {
                    footer = h(
                        'span',
                        { style: { color: C.err } },
                        status === 'timeout' ? t('lan.ask.timeout') : ask.answer || t('lan.ask.failed'),
                    )
                }
                return h(
                    'div',
                    {
                        key: `a_${ask.id}`,
                        style: {
                            border: `1px solid ${pending ? mix(C.brand, 22) : C.border}`,
                            borderRadius: 12,
                            background: pending ? `linear-gradient(180deg, ${mix(C.brand, 4)}, ${C.layer1})` : C.layer1,
                            overflow: 'hidden',
                        },
                    },
                    h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '9px 13px',
                                borderBottom: '1px solid rgba(0, 0, 0, 0.045)',
                                background: 'rgba(248, 249, 251, 0.6)',
                                fontSize: 11.5,
                                color: C.text2,
                            },
                        },
                        h('span', { style: { fontWeight: 600, color: C.text } }, from),
                        h('span', null, '→'),
                        h('span', { style: { fontWeight: 600, color: C.text } }, toName),
                        h('span', { style: { marginLeft: 'auto', fontSize: 10.5 } }, headerRight),
                    ),
                    h(
                        'div',
                        {
                            style: {
                                padding: '11px 13px',
                                fontSize: 13,
                                lineHeight: 1.65,
                                color: C.text,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            },
                        },
                        ask.text,
                    ),
                    answered
                        ? h(
                              'div',
                              {
                                  style: {
                                      padding: '10px 13px 12px',
                                      borderTop: '1px solid rgba(0, 0, 0, 0.045)',
                                      fontSize: 13,
                                      lineHeight: 1.65,
                                      color: C.text,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                  },
                              },
                              ask.answer || '',
                          )
                        : null,
                    footer
                        ? h(
                              'div',
                              {
                                  style: {
                                      padding: '8px 13px',
                                      borderTop: '1px solid rgba(0, 0, 0, 0.045)',
                                      background: 'rgba(248, 249, 251, 0.5)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      fontSize: 10.5,
                                      color: C.text2,
                                      whiteSpace: 'pre-wrap',
                                  },
                              },
                              footer,
                          )
                        : null,
                )
            }

            function renderStream() {
                const solo = isHost && members.filter((member) => !member.isSelf).length === 0
                const first = streamItems.length ? streamItems[0].at : Date.now()
                return h(
                    'div',
                    {
                        ref: scrollRef,
                        style: {
                            flex: 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            padding: '4px 2px 8px',
                        },
                    },
                    streamItems.length
                        ? h(
                              'div',
                              {
                                  style: {
                                      alignSelf: 'center',
                                      fontSize: 10.5,
                                      color: C.text2,
                                      background: C.layer2,
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      margin: '2px 0',
                                  },
                              },
                              `${t('lan.stream.today')} ${hhmm(first)}`,
                          )
                        : null,
                    streamItems.map((item) => (item.type === 'message' ? renderMessage(item.message) : renderAsk(item.ask))),
                    solo && !closed
                        ? h(
                              'button',
                              {
                                  type: 'button',
                                  onClick: () => setInviteOpen(true),
                                  style: {
                                      marginTop: 4,
                                      border: `1px dashed ${C.border}`,
                                      borderRadius: 12,
                                      background: 'transparent',
                                      padding: '14px 16px',
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      fontFamily: 'inherit',
                                      color: C.text2,
                                      fontSize: 12,
                                      lineHeight: 1.7,
                                  },
                              },
                              h('div', { style: { color: C.text, fontWeight: 600, marginBottom: 2 } }, t('lan.room.hostHint')),
                              h('div', { style: { color: C.brand } }, t('lan.room.hostHintAction')),
                          )
                        : null,
                )
            }

            function renderComposer() {
                const disabled = closed || connBroken || reconnecting || connecting
                const canSend = !disabled && busy !== 'send' && draft.trim().length > 0 && !(mode === 'ask' && target === 'all')
                const targets = members
                    .filter((member) => !(member.isSelf || member.peerId === self.peerId))
                    .map((member) => ({ value: member.peerId, label: `${member.name}${member.isHost ? ` · ${t('lan.room.host')}` : ''}` }))
                const options = [{ value: 'all', label: t('lan.composer.everyone') }].concat(targets)
                const modeHint =
                    mode === 'ask' && target === 'all'
                        ? t('lan.ask.toAll')
                        : mode === 'ask'
                          ? t('lan.composer.askHint')
                          : t('lan.composer.hint')
                return h(
                    'div',
                    {
                        style: {
                            margin: '12px 0 16px',
                            border: `1px solid ${C.border}`,
                            borderRadius: 14,
                            background: C.layer1,
                            boxShadow: SHADOW_LIFT,
                            overflow: 'hidden',
                            opacity: disabled ? 0.65 : 1,
                        },
                    },
                    h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '9px 12px 0',
                                fontSize: 11.5,
                                color: C.text2,
                                flexWrap: 'wrap',
                            },
                        },
                        h('span', null, t('lan.composer.to')),
                        h(Select, {
                            value: target,
                            onChange: setTarget,
                            disabled,
                            options,
                            'aria-label': t('lan.composer.to'),
                        }),
                        h(
                            'span',
                            {
                                style: {
                                    fontSize: 10.5,
                                    color: mode === 'ask' && target === 'all' ? C.warn : C.text2,
                                    minWidth: 0,
                                },
                            },
                            disabled ? t('lan.composer.disabled') : modeHint,
                        ),
                    ),
                    h('textarea', {
                        ref: taRef,
                        value: draft,
                        disabled: disabled || busy === 'send',
                        placeholder: t('lan.composer.placeholder'),
                        onChange: (event) => setDraft(event.target.value),
                        onKeyDown: onComposerKeyDown,
                        rows: 2,
                        style: {
                            width: '100%',
                            boxSizing: 'border-box',
                            border: 0,
                            outline: 0,
                            resize: 'none',
                            height: 58,
                            padding: '10px 13px 0',
                            fontFamily: 'inherit',
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: C.text,
                            background: 'transparent',
                        },
                    }),
                    h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 9px' } },
                        h(
                            'div',
                            { style: { display: 'flex', background: C.layer2, borderRadius: 7, padding: 2 } },
                            [
                                { id: 'ask', label: t('lan.composer.ask') },
                                { id: 'message', label: t('lan.composer.send') },
                            ].map((item) =>
                                h(
                                    'button',
                                    {
                                        key: item.id,
                                        type: 'button',
                                        disabled,
                                        onClick: () => setMode(item.id),
                                        style: {
                                            border: 0,
                                            borderRadius: 5,
                                            padding: '4px 9px',
                                            fontSize: 11,
                                            fontFamily: 'inherit',
                                            cursor: disabled ? 'default' : 'pointer',
                                            background: mode === item.id ? C.layer1 : 'transparent',
                                            color: mode === item.id ? C.text : C.text2,
                                            fontWeight: mode === item.id ? 500 : 400,
                                            boxShadow: mode === item.id ? SHADOW : 'none',
                                        },
                                    },
                                    item.label,
                                ),
                            ),
                        ),
                        h('span', { style: { fontSize: 10.5, color: C.text2, whiteSpace: 'nowrap' } }, t('lan.composer.hint')),
                        h('div', { style: { flex: 1 } }),
                        h(
                            Btn,
                            {
                                kind: 'primary',
                                disabled: !canSend,
                                onClick: doSubmit,
                                title: mode === 'ask' ? t('lan.composer.ask') : t('lan.composer.send'),
                            },
                            busy === 'send' ? h(Spinner, { size: 12 }) : null,
                            mode === 'ask' ? t('lan.composer.ask') : t('lan.composer.send'),
                        ),
                    ),
                )
            }

            function renderRoomView() {
                return h(
                    'div',
                    { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
                    h(
                        'div',
                        { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 22px' } },
                        renderRoomBar(),
                        h(
                            'div',
                            { style: { flex: 1, minHeight: 0, display: 'flex', gap: 14, paddingTop: 14 } },
                            renderMembersPanel(),
                            h(
                                'div',
                                {
                                    style: {
                                        flex: 1,
                                        minWidth: 0,
                                        minHeight: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderLeft: `1px solid ${C.border}`,
                                        paddingLeft: 16,
                                    },
                                },
                                renderStream(),
                                renderComposer(),
                            ),
                        ),
                    ),
                )
            }

            function renderClosed() {
                return h(
                    'div',
                    {
                        style: {
                            flex: 1,
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 14,
                            padding: 24,
                        },
                    },
                    h('div', { style: { fontSize: 15, fontWeight: 600 } }, t('lan.room.closed')),
                    h('div', { style: { maxWidth: 430, textAlign: 'center', fontSize: 12, lineHeight: 1.8, color: C.text2 } }, t('lan.room.closedHint')),
                    h(Btn, { kind: 'primary', disabled: busy === 'leave', onClick: doLeave }, t('lan.join.back')),
                )
            }

            function renderInviteModal() {
                if (!inviteOpen) return null
                const usable = invites
                    .filter((invite) => invite.status === 'unused')
                    .sort((left, right) => Number(right.expiresAt) - Number(left.expiresAt))[0]
                const code = usable ? groupCode(usable.code) : ''
                return h(
                    'div',
                    {
                        onMouseDown: (event) => {
                            if (event.target === event.currentTarget) setInviteOpen(false)
                        },
                        style: {
                            position: 'absolute',
                            inset: 0,
                            zIndex: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 24,
                            background: 'var(--dsw-alias-bg-mask-1, rgba(15, 23, 42, 0.32))',
                        },
                    },
                    h(
                        'div',
                        {
                            role: 'dialog',
                            'aria-modal': 'true',
                            'aria-label': t('lan.invite.title'),
                            style: {
                                width: '100%',
                                maxWidth: 470,
                                maxHeight: '100%',
                                overflowY: 'auto',
                                boxSizing: 'border-box',
                                border: `1px solid ${C.border}`,
                                borderRadius: 16,
                                background: C.bg,
                                boxShadow: '0 18px 48px rgba(16, 24, 40, 0.22)',
                                padding: 20,
                            },
                        },
                        h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 } },
                            h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('lan.invite.title')),
                            h(
                                'div',
                                { style: { marginLeft: 'auto' } },
                                h(
                                    Btn,
                                    { small: true, title: t('lan.invite.close'), 'aria-label': t('lan.invite.close'), onClick: () => setInviteOpen(false) },
                                    h(Icon, { name: 'close', size: 13 }),
                                ),
                            ),
                        ),
                        usable
                            ? h(
                                  'div',
                                  {
                                      style: {
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 12,
                                          border: `1px dashed ${mix(C.brand, 42)}`,
                                          background: mix(C.brand, 4),
                                          borderRadius: 12,
                                          padding: '16px 14px',
                                      },
                                  },
                                  h(
                                      'div',
                                      { style: { flex: 1, minWidth: 0 } },
                                      h(
                                          'button',
                                          {
                                              type: 'button',
                                              onClick: () => copyInvite(usable.code),
                                              title: t('lan.invite.copyHint'),
                                              style: {
                                                  border: 0,
                                                  background: 'transparent',
                                                  padding: 0,
                                                  display: 'block',
                                                  fontFamily: MONO,
                                                  fontSize: 26,
                                                  letterSpacing: 3,
                                                  fontWeight: 600,
                                                  color: C.text,
                                                  cursor: 'pointer',
                                                  lineHeight: 1.2,
                                              },
                                          },
                                          code,
                                      ),
                                      h(
                                          'div',
                                          { style: { marginTop: 5, fontSize: 10.5, color: C.text2, display: 'flex', alignItems: 'center', gap: 5 } },
                                          h(
                                              'span',
                                              {
                                                  style: {
                                                      width: 9,
                                                      height: 9,
                                                      borderRadius: '50%',
                                                      border: `1.3px solid ${C.text2}`,
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'center',
                                                  },
                                              },
                                              h('span', { style: { width: 2, height: 2, borderRadius: '50%', background: C.text2 } }),
                                          ),
                                          t('lan.invite.once'),
                                      ),
                                  ),
                                  h(
                                      Btn,
                                      { small: true, title: t('lan.copy.done'), 'aria-label': t('lan.copy.done'), onClick: () => copyInvite(usable.code) },
                                      h(Icon, { name: 'copy', size: 13 }),
                                  ),
                              )
                            : h(
                                  'div',
                                  {
                                      style: {
                                          border: `1px dashed ${C.border}`,
                                          borderRadius: 12,
                                          padding: '18px 14px',
                                          textAlign: 'center',
                                          fontSize: 12,
                                          color: C.text2,
                                      },
                                  },
                                  t('lan.invite.none'),
                              ),
                        h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 0', fontSize: 11.5, color: C.text2, flexWrap: 'wrap' } },
                            h('span', null, t('lan.invite.address')),
                            h('span', { style: { fontFamily: MONO, color: C.text } }, (room && room.address) || '—'),
                            h('span', { style: { marginLeft: 'auto', fontSize: 10.5, opacity: 0.8 } }, t('lan.invite.sameWifi')),
                        ),
                        h('div', { style: { marginTop: 10, fontSize: 10.5, lineHeight: 1.75, color: C.text2 } }, t('lan.invite.hint')),
                        h(
                            'div',
                            { style: { display: 'flex', gap: 8, marginTop: 16 } },
                            h(
                                Btn,
                                { kind: 'outline', style: { flex: 1 }, disabled: inviteBusy, onClick: doInvite },
                                inviteBusy ? h(Spinner, { size: 12 }) : null,
                                t('lan.invite.again'),
                            ),
                            h(Btn, { kind: 'primary', style: { flex: 1 }, onClick: () => setInviteOpen(false) }, t('lan.invite.done')),
                        ),
                    ),
                )
            }

            function renderConnBar() {
                if (connBroken) {
                    return h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 22px',
                                background: WARN_SOFT,
                                color: WARN_TEXT,
                                fontSize: 11.5,
                                borderBottom: `1px solid ${mix(C.warn, 24)}`,
                                flex: '0 0 auto',
                            },
                        },
                        h(Dot, { size: 6, color: C.warn }),
                        h('span', { style: { fontWeight: 600 } }, t('lan.conn.broken')),
                        h('span', { style: { opacity: 0.78 } }, t('lan.conn.retry')),
                    )
                }
                if (connecting || reconnecting) {
                    return h(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 22px',
                                background: WARN_SOFT,
                                color: WARN_TEXT,
                                fontSize: 11.5,
                                borderBottom: `1px solid ${mix(C.warn, 24)}`,
                                flex: '0 0 auto',
                            },
                        },
                        h(Dot, { size: 6, color: C.warn }),
                        h('span', { style: { fontWeight: 600 } }, connecting ? t('lan.room.status.connecting') : t('lan.notice.reconnecting')),
                        h('span', { style: { opacity: 0.78 } }, (room && room.hostName) || ''),
                    )
                }
                return null
            }

            const header = h(
                'div',
                {
                    style: {
                        flex: '0 0 56px',
                        height: 56,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '0 22px',
                        borderBottom: `1px solid ${C.border}`,
                    },
                },
                h('div', { style: { fontSize: 15, fontWeight: 600, letterSpacing: 0.2 } }, t('lan.title')),
                h(
                    'span',
                    {
                        style: {
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: C.brand,
                            background: mix(C.brand, 9),
                            borderRadius: 999,
                            padding: '2px 7px',
                        },
                    },
                    'LAN',
                ),
                h('div', { style: { flex: 1 } }),
                isHost && !closed
                    ? h(
                          Btn,
                          { kind: 'primary', disabled: busy === 'leave', onClick: () => setInviteOpen(true) },
                          h(Icon, { name: 'plus', size: 12, weight: 2.2 }),
                          t('lan.invite.action'),
                      )
                    : null,
            )

            let body
            if (snap === null) {
                body = h(
                    'div',
                    { style: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.text2, fontSize: 12 } },
                    h(Spinner, { size: 13 }),
                    t('lan.loading'),
                )
            } else if (role === 'idle') {
                if (view === 'create') {
                    body = h(CreateForm, {
                        t,
                        defaultName: (snap.self && snap.self.name) || '',
                        busy,
                        error: formError,
                        onSubmit: doCreate,
                        onCancel: () => setView('empty'),
                    })
                } else if (view === 'join') {
                    body = h(JoinForm, {
                        t,
                        defaultName: (snap.self && snap.self.name) || '',
                        busy,
                        error: formError,
                        onSubmit: doJoin,
                        onCancel: () => setView('empty'),
                    })
                } else {
                    body = h(EmptyView, {
                        t,
                        onCreate: () => {
                            setFormError(null)
                            setView('create')
                        },
                        onJoin: () => {
                            setFormError(null)
                            setView('join')
                        },
                    })
                }
            } else if (closed) {
                body = renderClosed()
            } else {
                body = renderRoomView()
            }

            return h(
                'div',
                {
                    ref: rootRef,
                    'data-lan-room': 'panel',
                    style: {
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: '1 1 auto',
                        height: '100%',
                        minHeight: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        paddingTop: 'var(--dsh-frame-top-clearance, 0px)',
                        background: C.bg,
                        color: C.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                    },
                },
                header,
                renderConnBar(),
                body,
                renderInviteModal(),
                toast
                    ? h(
                          'div',
                          {
                              style: {
                                  position: 'absolute',
                                  left: '50%',
                                  bottom: 22,
                                  transform: 'translateX(-50%)',
                                  zIndex: 30,
                                  pointerEvents: 'none',
                                  maxWidth: 420,
                                  padding: '7px 13px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  border: `1px solid ${toast.ok ? mix(C.ok, 24) : mix(C.err, 24)}`,
                                  background: toast.ok ? OK_SOFT : ERR_SOFT,
                                  color: toast.ok ? C.ok : C.err,
                                  boxShadow: '0 4px 14px rgba(16, 24, 40, 0.12)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                              },
                          },
                          toast.text,
                      )
                    : null,
            )
        }

        return {
            inject: ['slots', 'locale'],
            apply(ctx) {
                let bound
                try {
                    bound = ctx.locale.bind(NS)
                } catch (error) {
                    bound = undefined
                }
                const t = makeT(bound)
                const dicts = { zh: ZH, en: EN, 'zh-CN': ZH, 'en-US': EN }
                const registerDicts = () => {
                    try {
                        return ctx.locale.register(NS, dicts)
                    } catch (error) {
                        return undefined
                    }
                }
                if (typeof ctx.effect === 'function') {
                    ctx.effect(registerDicts, 'lan-room: dictionaries')
                } else {
                    registerDicts()
                }
                ctx.slots.inject('sidebar.panellist', () =>
                    ctx.slots.register(
                        {
                            name: 'sidebar.panellist',
                            id: 'lan-room',
                            order: 20,
                            locale: NS,
                            label: () => t('lan.title'),
                        },
                        PinIcon,
                    ),
                )
                ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'lan-room', locale: NS }, Page))
            },
        }
    },
})
