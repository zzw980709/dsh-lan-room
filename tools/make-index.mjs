#!/usr/bin/env node
/**
 * 生成插件市场索引 market-index.json。
 *
 *   node tools/make-index.mjs --git     # 以当前 HEAD 作为版本来源（不发布 npm 也能用）
 *   node tools/make-index.mjs --npm     # 以 npm 上的同名版本作为来源
 *
 * 产物放在仓库根，与 icon.svg 同级，便于用 GitHub raw / Pages 直接托管。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const mode = process.argv.includes('--npm') ? 'npm' : 'git'

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

let source
let publishTimestamp
if (mode === 'npm') {
    source = { type: 'npm' }
    publishTimestamp = Date.now()
} else {
    const commit = git('rev-parse', 'HEAD')
    const seconds = Number(git('log', '-1', '--format=%ct'))
    source = { type: 'git', url: pkg.repository.url.replace(/\.git$/, ''), commit, path: '/' }
    publishTimestamp = seconds * 1000
}

const repository = pkg.repository.url.replace(/\.git$/, '')
const index = {
    title: { en: `${pkg.author}'s DSH plugins`, 'zh-CN': `${pkg.author} 的 DSH 插件` },
    description: {
        en: 'Installable DeepSeek Harness plugins.',
        'zh-CN': '可安装的 DeepSeek Harness 插件。',
    },
    metadata: {
        categories: { collaboration: { title: { en: 'Collaboration', 'zh-CN': '协作' } } },
        labels: {},
        sortKeys: {},
    },
    plugins: [
        {
            name: pkg.name,
            title: { en: 'LAN Rooms', 'zh-CN': '局域网联机' },
            description: {
                en: 'Host a room on your LAN, let other machines join with a one-time invite code, and have their agents ask each other questions.',
                'zh-CN': '在局域网里开一个房间，别人用一次性邀请码加入，各自的 agent 可以互相提问。',
            },
            icon: './icon.svg',
            author: pkg.author,
            homepage: pkg.homepage,
            repository: { url: repository },
            metadata: { category: 'collaboration', keywords: pkg.keywords, labels: [], sortKeys: {} },
            versions: [
                {
                    version: pkg.version,
                    publishTimestamp,
                    source,
                    engines: pkg.engines ?? {},
                },
            ],
        },
    ],
}

const target = join(root, 'market-index.json')
writeFileSync(target, `${JSON.stringify(index, null, 2)}\n`)
console.log(`wrote ${target}`)
console.log(`  name    ${pkg.name}@${pkg.version}`)
console.log(`  source  ${source.type}${source.commit ? ` ${source.commit.slice(0, 8)}` : ''}`)
