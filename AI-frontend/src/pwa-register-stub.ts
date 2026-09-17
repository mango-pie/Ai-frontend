// 非 music-standalone 模式没有注册 vite-plugin-pwa，`virtual:pwa-register` 无法解析；
// dev 下 /music 会兜底到根目录 music.html（独立播放器入口），用本替身保证其可加载。
// standalone 构建仍由插件提供真实现，别名只在主站模式生效。
/**
 * SW 注册替身：返回一个立即 resolve 的空操作函数，
 * 使主站模式下对 registerSW 的调用成为无害空调用。
 */
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve()
}
