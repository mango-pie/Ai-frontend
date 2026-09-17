// 扩展 axios 配置：silent404 —— 可选云端能力在端点缺失（404）时静默降级，
// 不弹「该功能未启用或不存在」全局提示（见 src/request.ts 拦截器）。
import 'axios'

declare module 'axios' {
  export interface AxiosRequestConfig {
    silent404?: boolean
  }
}
