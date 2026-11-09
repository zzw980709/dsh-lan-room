/**
 * dsh-lan-room · 局域网联机插件（Host 半入口）
 *
 * 全部实现放在 lib/plugin.js，用带版本号的动态 import 加载：
 * DSH 的 ESM 模块缓存按 URL 生效，所以禁/启一次插件行就能拿到最新代码。
 */
export const name = 'dsh-lan-room'

export const inject = ['tools', 'webServer', 'agents', 'sessionController', 'sessions', 'agentDefaultModel']

export function apply(ctx, config = {}) {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const url = new URL(`./lib/plugin.js?v=${stamp}`, import.meta.url).href
    import(url)
        .then(({ createPlugin }) => {
            const dispose = createPlugin(ctx, config)
            if (typeof ctx.effect === 'function') ctx.effect(() => () => dispose?.())
            else if (typeof ctx.on === 'function') ctx.on('dispose', () => dispose?.())
        })
        .catch((error) => {
            try {
                ctx.logger?.info?.('[lan-room] load failed', error)
            } catch {
                /* logging must never break the plugin */
            }
        })
}

export default { name, inject, apply }
