# dsh-lan-room · 局域网联机

让同一个局域网里装了 DeepSeek Harness 的几台机器组成一个「房间」：一台开房、其他人用一次性邀请码加入，各自的 agent 可以互相提问、互相回答。

- 主机（Host）：开房的机器，插件里起一个局域网房间服务（默认 `0.0.0.0:8787`）。
- 访客（Guest）：用邀请码加入的机器，主动连主机，不监听端口。
- 只做问答：远端只能提问，本地 agent 用自己的只读工具回答；不允许远端写文件、跑命令。

## 安装

需要 DeepSeek Harness **0.2.2-rc.1** 或更新版本（`engines.dsh` 会拦住不兼容的安装）。

```bash
# 1. 从 npm（推荐，发布后可用）
dsh plugin --profile desktop add dsh-lan-room

# 2. 直接从 GitHub 安装（无需 npm 发布）
dsh plugin --profile desktop add git+https://github.com/zzw980709/dsh-lan-room.git

# 3. 本地目录（开发调试）
dsh plugin --profile desktop add /path/to/dsh-lan-room
```

也可以在 Harness 的「插件」页面里安装本地 bundle（选这个目录）。装完**重启 Harness**——Host 半的实现会被进程内模块缓存住，重启才能生效；之后改面板只需刷新页面。

想把它放进插件市场、或让别人用 Git/npm 安装，见 [docs/PUBLISHING.md](DOCS/PUBLISHING.md)。

## 用法

### A 开房

1. 侧边栏底部「联机」→「创建房间」，填房间名与端口（默认 8787，冲突自动顺延）。
2. 进房后点「邀请成员」，得到 8 位一次性邀请码与房间地址（形如 `192.168.1.23:8787`）。
3. 把邀请码发给同事。每张码只能使用一次，24 小时过期，可单独撤销。

也可以直接对 agent 说：「帮我开一个局域网房间」。

### B 加入

1. 「联机」→「加入房间」，填入邀请码、房间地址、本机显示名。
2. 加入后，A 的成员列表出现 B，双方消息流同步。

### 提问

- 面板：输入框选「发给 zzw-air」→ 模式「提问」→ 回车。提问卡会显示「正在处理」，收到回答后展示答案、耗时与步数。
- agent：直接说「问一下 zzw-air：这个报错怎么修？」，模型会调用 `lan_ask`。

远端机器收到提问后，会在**本地专用会话**（标题 `联机 · <对方名字>`）里跑一轮 agent，然后把答案回传。本地用户能看到这次问答的全过程。

## 工具

| 工具 | 作用 |
|---|---|
| `lan_room_create` | 开房，返回房间号、地址、首张邀请码 |
| `lan_room_invite` | 再生成邀请码（1–5 张） |
| `lan_room_join` | 用邀请码加入房间 |
| `lan_room_status` | 房间、成员、在线状态、邀请码、最近消息与提问 |
| `lan_ask` | 向某个成员提问并等待回答（默认 300s，最长 600s） |
| `lan_send` | 发一条普通消息 |
| `lan_room_leave` | 离开房间 / 关闭自己主持的房间 |

## 安全模型

- **一次性邀请码**：8 位（40bit），一码一人，用过即废；同一 IP 限流，连续失败锁定。
- **码不上线**：加入请求只带 `inviteId` + 证明，码本体不经过网络，同网段嗅探拿不到可用码。
- **端到端加密**：握手后每一帧都用该成员独立派生的 AES-256-GCM 密钥加密，序号单调递增并作为 AAD 绑定，防窃听、防篡改、防重放。
- **只读回答**：房间 agent 只拿到 `read / read_image / glob / grep / lsp / web_search / web_fetch`，远端文本标记为不可信外部输入；`.env`、密钥、SSH 私钥等在系统提示里硬禁。
- **可见可审**：每次远端问答都在本机留下一个普通会话，另有 `~/.dsh/lan-room/` 审计记录（后续版本）。
- 明确不承诺：抗同网段主动 MITM、跨网段/公网可用性。

## 协议与实现

```
Host:  node:http  0.0.0.0:8787
       POST /join     邀请码握手（明文 + HMAC 证明）
       GET  /events   SSE 下行（加密帧）
       POST /rpc      上行（加密帧）
Guest: fetch + ReadableStream 解析 SSE，指数退避重连
```

- 面板走 Harness 自己 loopback 的 `/lan-room/*` 控制面（同源 fetch），不占房间端口。
- 会话桥接：`agents.create`（显式 provider/model、只读工具限制、审批 `never`）→ `sessionController.prompt` → 观察 `state` 等这一轮结束 → `wait` 取回 assistant 文本。
- 每个 peer 一个专用会话，串行提问，避免串话。
- 超时（默认 300s）返回 `timeout`，但不中止对方执行；对方跑完会补发一条「迟到的回答」。

## 开发

一个包、两个 half：

```
boot.js         Host 入口（带版本号动态加载 lib/plugin.js，便于热迭代）
lib/plugin.js   工具、控制面、生命周期
lib/room.js     协议：Host 服务端 + Guest 客户端 + 邀请码 + 加解密
lib/bridge.js   Agent 桥接
client.js       面板（Client half）
locale/         中英文案
test/e2e.mjs    无 DSH 的协议自测：node test/e2e.mjs
```

隔离实例（不重启主力 Harness 就能验证 Host 半）：

```bash
cat > /tmp/lan-dev.yml <<'EOF'
- insert:
    - id: lan-room
      name: /Users/zhengzhiwei/zzw/dsh-lan-room/boot.js
EOF
dsh web --patch /tmp/lan-dev.yml --port 53999 --host 127.0.0.1 --no-open
```

## 已知限制

- 房间只在 Harness 运行期间存在，没有离线消息；应用退出即散房。
- 首次监听时 macOS/Windows 会弹「允许传入连接」，拒绝则局域网不可达。
- 同网段 AP 隔离 / 公司网可能互不可达，面板会提示换网或手填地址。
- 面板 v1 不渲染二维码（复制邀请码 + 地址）；`mockup/` 里有设计稿。
- 房间会话会出现在侧边栏（`联机 · xxx`），这是有意的审计可见性。
