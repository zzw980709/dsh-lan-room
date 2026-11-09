# dsh-lan-room · 面板 ↔ Host 控制面契约（v0.1）

面板（`client.js`）只通过同源 HTTP 访问本机 Host 插件，不直接连房间端口。
所有路径以 `/lan-room` 为前缀，注册在 DSH 自己的 loopback `webServer` 上。

## 约定

- 请求/响应均为 `application/json; charset=utf-8`。
- 成功：`200 { "ok": true, "data": <value> }`
- 失败：`200 { "ok": false, "error": { "code": "<code>", "message": "<中文可读>" } }`
  （不用 HTTP 状态码承载业务错误，便于前端统一处理。）
- 无鉴权参数：与本页面同源，依赖 DSH 自己的 owner 会话；服务仅监听 loopback。

## GET `/lan-room/state`

返回完整快照，面板每 1.5s 轮询一次（或按需刷新）。

```jsonc
{
  "ok": true,
  "data": {
    "role": "idle" | "host" | "guest",
    "self": { "peerId": "host", "name": "zzw-mbp", "platform": "macOS" },
    "room": {
      "id": "7F3K-2QM9",
      "title": "我的房间",
      "address": "192.168.1.23:8787",
      "port": 8787,
      "createdAt": 1731130000000,
      "expiresAt": 1731158800000,
      "memberLimit": 8,
      "hostName": "zzw-mbp",
      "status": "running"            // host: running | closed
                                      // guest: connecting | joined | reconnecting | disconnected | closed
    },
    "members": [
      {
        "peerId": "host",
        "name": "zzw-mbp",
        "platform": "macOS",
        "status": "online",           // online | busy | offline
        "isHost": true,
        "isSelf": true,
        "joinedAt": 1731130000000,
        "lastSeen": 1731130100000
      }
    ],
    "invites": [
      {
        "inviteId": "7F",
        "code": "7F3K-2QM9",
        "status": "unused",           // unused | used | expired | revoked
        "expiresAt": 1731216400000,
        "usedBy": null,               // 使用者的显示名
        "usedAt": null
      }
    ],
    "messages": [
      { "id": "m_1", "kind": "system", "from": "host", "to": "all",
        "text": "房间已创建", "ts": 1731130000000 },
      { "id": "m_2", "kind": "chat", "from": "host", "to": "p_x",
        "text": "你好", "ts": 1731130001000 }
    ],
    "asks": [
      { "id": "a_1", "from": "host", "to": "p_x", "text": "……",
        "status": "pending",          // pending | ok | timeout | error
        "createdAt": 1731130002000, "answeredAt": null,
        "answer": null, "meta": null }
    ]
  }
}
```

- `room` 在 `role === "idle"` 时为 `null`。
- `invites` 仅 Host 有；Guest 为空数组。
- `messages` / `asks` 保留最近 100 条，按时间升序。
- `members` 含自己；`peerId === "host"` 固定表示房间主持人。

## POST 命令

| 路径 | 请求体 | 成功 `data` | 主要错误码 |
|---|---|---|---|
| `/lan-room/create` | `{ title?, displayName?, port?, ttlMinutes? }` | `{ room }` | `port-unavailable` |
| `/lan-room/invite` | `{ count?, ttlMinutes? }` | `{ invites: [...] }` | `not-host` `room-closed` |
| `/lan-room/revokeInvite` | `{ inviteId }` | `{ invites: [...] }` | `not-host` `invite-unknown` |
| `/lan-room/join` | `{ code, address?, displayName? }` | `{ room }` | `invite-unknown` `invite-used` `invite-expired` `unreachable` `room-full` `already-in-room` |
| `/lan-room/leave` | `{}` | `{ ok: true }` | — |
| `/lan-room/ask` | `{ to, text }` | `{ askId }` | `no-room` `peer-unknown` `peer-offline` `too-long` |
| `/lan-room/send` | `{ to, text }` | `{ messageId }` | `no-room` `peer-unknown` |

- `code` 接受大小写、空格、连字符，服务端归一化为 8 位大写。
- `address` 可省略：邀请码不含地址时必填；含地址时由二维码/复制串带入（v0.1 由用户在表单里填）。
- `to` 允许 `"host"` / 具体 `peerId` / `"all"`（仅 `send`）。
- `ask` 立即返回 `askId`，答案通过 `/state` 的 `asks` 轮询获得（v0.1 不做独立流）。

## 面板需要的本地行为

- 轮询 `/state`，请求失败时保留上一份快照并标记「连接中断」。
- 创建/加入成功后立刻刷新一次，不等轮询。
- 邀请码点击复制：写 `navigator.clipboard`，失败时退化到 `document.execCommand('copy')` 并给出提示。
- 所有可见文案走 Client locale service，命名空间 `lan-room`。
