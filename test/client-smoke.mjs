/**
 * Client 半冒烟：用最小 stub 加载 client.js，确认模块可解析、apply 能注册
 * 侧边栏图钉与主页面、locale 字典可用，且不会在加载期产生副作用。
 *
 * 运行：node test/client-smoke.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const registrations = []
const injected = []
const localeRegistrations = []
let loaded = null

globalThis.window = {
    __ModuleLoader__: {
        load(options) {
            loaded = options
        },
    },
}

function fakeElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
}

const React = {
    createElement: fakeElement,
    Fragment: 'Fragment',
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: (init) => ({ current: init }),
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useReducer: (reducer, init) => [init, () => {}],
    createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }),
    useContext: () => ({}),
    memo: (component) => component,
    forwardRef: (component) => component,
}

const requireStub = (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require: ${id}`)
}

// 执行 client.js（它只会调用 __ModuleLoader__.load）
const run = new Function('window', 'require', source)
run(globalThis.window, requireStub)
if (!loaded) throw new Error('client.js 没有调用 __ModuleLoader__.load')
if (loaded.id !== 'dsh-lan-room') throw new Error(`模块 id 不正确：${loaded.id}`)

const module_ = loaded.factory(requireStub)
if (!module_ || typeof module_.apply !== 'function') throw new Error('factory 没有返回 apply')

const ctx = {
    slots: {
        inject(key, callback) {
            injected.push(key)
            return callback()
        },
        register(definition, component) {
            registrations.push({ definition, component })
            return () => {}
        },
    },
    locale: {
        register(ns, dicts) {
            localeRegistrations.push({ ns, dicts })
            return () => {}
        },
        bind(ns) {
            const dict = localeRegistrations.find((item) => item.ns === ns)?.dicts?.['zh-CN'] ?? {}
            return (key, params) => {
                let text = dict[key] ?? key
                for (const [name, value] of Object.entries(params ?? {})) {
                    text = text.replaceAll(`{${name}}`, String(value))
                }
                return text
            }
        },
    },
    effect: (callback) => {
        const disposer = callback()
        return typeof disposer === 'function' ? disposer : () => {}
    },
    on: () => () => {},
}

module_.apply(ctx)

const panellist = registrations.find((item) => item.definition.name === 'sidebar.panellist')
const main = registrations.find((item) => item.definition.name === 'main')

const problems = []
if (!injected.includes('sidebar.panellist')) problems.push('没有 inject sidebar.panellist')
if (!injected.includes('main')) problems.push('没有 inject main')
if (!panellist) problems.push('没有注册侧边栏图钉')
if (panellist && panellist.definition.id !== 'lan-room') problems.push('图钉 id 不是 lan-room')
if (panellist && typeof panellist.component !== 'function') problems.push('图钉不是组件')
if (!main) problems.push('没有注册主页面')
if (main && main.definition.key !== 'lan-room') problems.push('主页面 key 不是 lan-room')
if (main && typeof main.component !== 'function') problems.push('主页面不是组件')
if (localeRegistrations.length === 0) problems.push('没有注册 locale 字典')
const dicts = localeRegistrations[0]?.dicts ?? {}
if (!dicts['zh-CN'] || !dicts['en-US']) problems.push('locale 缺少中文或英文')
if (Object.keys(dicts['zh-CN'] ?? {}).length < 50) problems.push('中文文案数量异常')

// 图钉组件应可渲染（带 ownerProps）
if (panellist) {
    try {
        const tree = panellist.component({ size: 18, active: false })
        if (!tree) problems.push('图钉组件返回空')
    } catch (error) {
        problems.push(`图钉组件渲染失败：${error.message}`)
    }
}

if (problems.length > 0) {
    console.error('✗ client 冒烟失败：')
    for (const problem of problems) console.error('  -', problem)
    process.exit(1)
}

console.log('✓ client.js 加载正常，模块 id 正确')
console.log(`✓ 注册了 ${registrations.length} 个 slot：${registrations.map((item) => item.definition.name).join(', ')}`)
console.log(`✓ locale 字典：${Object.keys(dicts['zh-CN']).length} 个中文键 / ${Object.keys(dicts['en-US']).length} 个英文键`)
console.log('✓ 图钉组件可渲染')
