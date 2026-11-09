# 发布与分发

这个仓库既是一个 DSH 插件包，也是一个可以直接托管插件市场索引的仓库。三条安装路径对应三种发布程度，从轻到重：

| 方式 | 需要什么 | 命令 |
|---|---|---|
| 本地目录 | 无 | `dsh plugin --profile desktop add /path/to/dsh-lan-room` |
| Git 仓库 | 一个公开 Git 仓库 | `dsh plugin --profile desktop add git+https://github.com/<user>/dsh-lan-room.git` |
| npm | npm 账号 | `dsh plugin --profile desktop add dsh-lan-room` |
| 插件市场 | 上一条 + 一个索引 JSON | 在 Discover 里添加索引 URL |

## 1. 包本身要满足什么

DSH 通过 `package.json` 的 `dsh` 字段识别 bundle 和客户端入口：

```jsonc
{
  "name": "dsh-lan-room",            // 市场条目的 name 必须与此一致
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./boot.js",                 // Host 半入口
    "./client": "./client.js",        // 可选：Client 半
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["boot.js", "index.js", "client.js", "lib", "cordis.patch.yml", "locale", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-conversation"] }
  },
  "engines": { "dsh": ">=0.2.2-rc.1" }  // 市场与安装器都会校验
}
```

- `dsh.bundle.patch` 指向的 patch 里，插件行的 `name` 要写包名本身。
- `dsh.client` 存在时，Client 模块里的 `id` 也必须等于包名（`window.__ModuleLoader__.load({ id })`）。
- `engines.dsh` 写不对会被安装器直接拒绝；市场里每个版本都带这个字段。

## 2. 发布到 npm

```bash
npm login
npm publish --access public
```

发布前确认：

- `npm pack --dry-run` 里包含 `boot.js`、`lib/`、`client.js`、`locale/`、`icon.svg`、`cordis.patch.yml`；
- `version` 已递增（市场用版本号判断 `update-available`）；
- `repository` 字段指向公开仓库——市场详情页会去读它的 README。

## 3. 建一个插件市场索引

市场索引是**一个 JSON 文件**，由用户在其 Discover 里添加 URL。索引只负责「展示 + 拼安装参数」，真正安装仍走 `plugin_manager`（所以会有一次安装确认）。

最小结构（完整例子见 `market/index.example.json`）：

```jsonc
{
  "title": { "en": "zhengzhiwei's DSH plugins", "zh-CN": "zhengzhiwei 的 DSH 插件" },
  "plugins": [
    {
      "name": "dsh-lan-room",
      "title": { "en": "LAN Rooms", "zh-CN": "局域网联机" },
      "description": { "zh-CN": "同一局域网内让 agent 互相提问。" },
      "icon": "./icon.svg",                     // 相对索引 URL 解析
      "author": "zhengzhiwei",
      "homepage": "https://github.com/<user>/dsh-lan-room",
      "repository": { "url": "https://github.com/<user>/dsh-lan-room" },
      "metadata": { "category": "collaboration", "keywords": ["lan", "agent"] },
      "versions": [
        {
          "version": "0.1.0",
          "publishTimestamp": 1790000000000,     // 毫秒时间戳
          "source": { "type": "npm" },            // 或 git 源，见下
          "engines": { "dsh": ">=0.2.2-rc.1" }
        }
      ]
    }
  ]
}
```

Git 源（不发布 npm 也能进市场）：

```jsonc
"source": {
  "type": "git",
  "url": "https://github.com/<user>/dsh-lan-room",
  "commit": "<40 位 commit sha>",                // 必须固定到 commit
  "path": "/"                                    // 包在仓库子目录时填写
}
```

生成索引：

```bash
node tools/make-index.mjs --git    # 用当前 HEAD 生成 market-index.json
node tools/make-index.mjs --npm    # npm 源，版本取 package.json
```

托管：把生成的 `market-index.json` 和 `icon.svg` 放在同一目录（例如仓库根、GitHub Pages、任意静态服务器），把它的 **http(s) URL** 作为索引地址。索引不支持重定向，必须是最终 URL；相对图标路径按索引 URL 解析。

详情页内容按顺序取：包内 locale 的 `meta.detail` → 包 README → 仓库 README。所以 README 写清楚就是市场里的介绍页。

## 4. 让用户看到它

1. 用户启用插件市场（Discover）能力；
2. 在 Discover 里添加索引 URL；
3. 搜到 `dsh-lan-room` → 安装 → 重启 Harness。

## 5. 版本与兼容规则

- 市场默认选中「最高且满足 `engines.dsh` 的非预发布版本」；没有非预发布版本时才退到预发布。
- `update-available` 只提示，不会自动升级；升级仍是卸载再安装。
- 索引里声明的 name/version/engines 都是索引方的说法，最终以安装后的 `package.json` 为准。

## 6. 发布检查清单

- [ ] `node test/e2e.mjs`、`node test/client-smoke.mjs` 全绿
- [ ] `npm pack --dry-run` 文件齐全
- [ ] 版本号递增，`engines.dsh` 与目标 Harness 版本一致
- [ ] git tag `v<version>`，索引里的 `commit` 指向该 tag 的 commit
- [ ] 索引 JSON 能被市场正常解析（在 Discover 里加一次即可验证）
- [ ] README 顶部写清安装命令与已知限制
