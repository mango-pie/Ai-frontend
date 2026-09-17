/**
 * 运维中心 · 实时日志流（SSE）
 * GET /admin/ops/logs/stream — event: log | ready | ping
 */

export interface OpsLogEntry {
  /** HH:mm:ss.SSS */
  time: string
  level: string
  thread: string
  logger: string
  message: string
  throwable?: string
  traceId?: string
  /** log=系统日志 audit=审计事件 */
  kind?: 'log' | 'audit'
}

/** SSE 推送回调集合：每条日志、连接就绪、连接状态变化 */
type Handlers = {
  onEntry: (entry: OpsLogEntry) => void
  onReady?: () => void
  onStatusChange?: (status: 'connecting' | 'open' | 'closed') => void
}

/**
 * 建立运维日志的 SSE 实时流连接
 * @param options.debug 附加 debug=true 查询参数，后端返回调试级日志
 * @param handlers      日志条目与连接状态回调
 * @returns 含 close() 的句柄，调用后停止接收并关闭连接
 */
export function connectOpsLogStream(
  options: { debug?: boolean } = {},
  handlers: Handlers,
): { close: () => void } {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const url = `${base}/admin/ops/logs/stream${options.debug ? '?debug=true' : ''}`

  let es: EventSource | null = null
  let closedByUser = false

  function open() {
    handlers.onStatusChange?.('connecting')
    const source = new EventSource(url, { withCredentials: true })
    es = source
    source.onopen = () => handlers.onStatusChange?.('open')
    source.addEventListener('log', (ev) => {
      try {
        handlers.onEntry(JSON.parse((ev as MessageEvent).data) as OpsLogEntry)
      } catch {
        /* 跳过无法解析的行 */
      }
    })
    source.addEventListener('ready', () => handlers.onReady?.())
    source.onerror = () => {
      handlers.onStatusChange?.('closed')
      if (closedByUser) return
      // EventSource 会自动重连；1s 后未恢复则强制重建，避免停留在半死连接
      setTimeout(() => {
        if (closedByUser || es !== source) return
        source.close()
        open()
      }, 1000)
    }
  }

  open()

  return {
    close() {
      closedByUser = true
      es?.close()
      handlers.onStatusChange?.('closed')
    },
  }
}
