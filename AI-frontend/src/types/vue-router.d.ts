export {}

declare module 'vue-router' {
  interface RouteMeta {
    keepAlive?: boolean
    /** 对应 GET /app/modules 的模块 key，缺省或未启用时由路由守卫拦截 */
    requireModule?: string
  }
}
