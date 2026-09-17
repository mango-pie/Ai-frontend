/**
 * 业务模块 key 与前端入口的映射。
 * 契约来自后端 GET /app/modules（baseURL 已含 /api，路径为 /app/modules）。
 * 成功响应里缺省的 key 视为关闭；不要假设 key 一定存在。
 */
export const MODULE_KEYS = [
  'ops',
  'blog',
  'knowledge',
  'library',
  'reading',
  'chat',
  'study',
  'diary',
  'worklog',
  'tts',
  'app-lab',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

/** 模块 key -> 中文显示名（用于菜单、提示等 UI 展示） */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  ops: '运维',
  blog: '博客',
  knowledge: '知识库',
  library: '资料库',
  reading: '精读任务',
  chat: '对话',
  study: '学习',
  diary: '日记',
  worklog: '工作日志',
  tts: '语音合成',
  'app-lab': '实验室',
}

/** 路径前缀 → 模块。更长前缀需排在前面。 */
const MODULE_PATH_PREFIXES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: '/admin/blogManage', module: 'blog' },
  { prefix: '/admin/chatHistoryManage', module: 'app-lab' },
  { prefix: '/admin/appManage', module: 'app-lab' },
  { prefix: '/administrator/study', module: 'study' },
  { prefix: '/knowledge', module: 'knowledge' },
  { prefix: '/library', module: 'library' },
  { prefix: '/category', module: 'blog' },
  { prefix: '/tag', module: 'blog' },
  { prefix: '/blog', module: 'blog' },
  { prefix: '/diary', module: 'diary' },
  { prefix: '/worklog', module: 'worklog' },
  { prefix: '/chat', module: 'chat' },
  { prefix: '/lab', module: 'app-lab' },
  { prefix: '/app/', module: 'app-lab' },
  { prefix: '/app', module: 'app-lab' },
]

/** 归一化模块 key：去空白、转小写、下划线转连字符，并兼容 app/applab/lab 等历史写法 */
export function normalizeModuleKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/_/g, '-')
  if (key === 'app' || key === 'applab' || key === 'lab') return 'app-lab'
  return key
}

/** 将后端返回的模块开关对象归一化为 { 模块key: 是否启用 }；非 true 一律视为关闭 */
export function parseModulesPayload(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    out[normalizeModuleKey(rawKey)] = value === true
  }
  return out
}

/** 判断模块表中某模块是否启用（key 先做归一化再匹配） */
export function isModuleEnabled(
  modules: Record<string, boolean>,
  name: string,
): boolean {
  return modules[normalizeModuleKey(name)] === true
}

/** 按路径前缀推断所属模块（去掉 query 与尾部斜杠后做前缀匹配，供路由守卫做模块门控） */
export function getRequiredModuleByPath(path: string): ModuleKey | undefined {
  const pathname = (path.split('?')[0] ?? path).replace(/\/+$/, '') || '/'
  return MODULE_PATH_PREFIXES.find((item) => {
    const prefix = item.prefix.replace(/\/+$/, '') || '/'
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })?.module
}

/** 取模块中文显示名；未知模块原样返回 key */
export function getModuleLabel(name: string): string {
  const key = normalizeModuleKey(name)
  return MODULE_LABELS[key as ModuleKey] ?? name
}
