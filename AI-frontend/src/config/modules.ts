/**
 * 业务模块 key 与前端入口的映射。
 * 契约来自后端 GET /app/modules（baseURL 已含 /api，路径为 /app/modules）。
 * 成功响应里缺省的 key 视为关闭；不要假设 key 一定存在。
 */
export const MODULE_KEYS = [
  'ops',
  'blog',
  'knowledge',
  'reading',
  'chat',
  'study',
  'diary',
  'tts',
  'app-lab',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  ops: '运维',
  blog: '博客',
  knowledge: '知识库',
  reading: '精读任务',
  chat: '对话',
  study: '学习',
  diary: '日记',
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
  { prefix: '/category', module: 'blog' },
  { prefix: '/tag', module: 'blog' },
  { prefix: '/blog', module: 'blog' },
  { prefix: '/diary', module: 'diary' },
  { prefix: '/chat', module: 'chat' },
  { prefix: '/lab', module: 'app-lab' },
  { prefix: '/app/', module: 'app-lab' },
  { prefix: '/app', module: 'app-lab' },
]

export function normalizeModuleKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/_/g, '-')
  if (key === 'app' || key === 'applab' || key === 'lab') return 'app-lab'
  return key
}

export function parseModulesPayload(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    out[normalizeModuleKey(rawKey)] = value === true
  }
  return out
}

export function isModuleEnabled(
  modules: Record<string, boolean>,
  name: string,
): boolean {
  return modules[normalizeModuleKey(name)] === true
}

export function getRequiredModuleByPath(path: string): ModuleKey | undefined {
  const pathname = (path.split('?')[0] ?? path).replace(/\/+$/, '') || '/'
  return MODULE_PATH_PREFIXES.find((item) => {
    const prefix = item.prefix.replace(/\/+$/, '') || '/'
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })?.module
}

export function getModuleLabel(name: string): string {
  const key = normalizeModuleKey(name)
  return MODULE_LABELS[key as ModuleKey] ?? name
}
