/**
 * 站点设置 API — 接口前缀 /admin/site-settings
 * 面向管理端：按模块读取/保存站点配置，支持 schema 动态渲染表单、
 * 集成连通性测试、健康检查与配置变更审计查询。
 */
import request from '@/request'

/** GET /admin/site-settings/bootstrap — 一次性拉取站点初始化所需的全部设置 */
export async function bootstrapSiteSettings(options?: { [key: string]: unknown }) {
  return request<API.BaseResponseSiteSettingsBootstrapVO>('/admin/site-settings/bootstrap', {
    method: 'GET',
    ...(options || {}),
  })
}

/** GET /admin/site-settings/modules — 列出全部配置模块（供设置页导航） */
export async function listSiteSettingModules(options?: { [key: string]: unknown }) {
  return request<API.BaseResponseListSettingModuleVO>('/admin/site-settings/modules', {
    method: 'GET',
    ...(options || {}),
  })
}

/** GET /admin/site-settings/{module}/schema — 获取模块配置的表单 schema（动态渲染用） */
export async function getSiteSettingSchema(
  module: string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseSettingModuleSchemaVO>(
    `/admin/site-settings/${encodeURIComponent(module)}/schema`,
    {
      method: 'GET',
      ...(options || {}),
    },
  )
}

/** GET /admin/site-settings/{module} — 读取模块当前配置值 */
export async function getSiteSettingValues(
  module: string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseSettingModuleValuesVO>(
    `/admin/site-settings/${encodeURIComponent(module)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  )
}

/** PUT /admin/site-settings/{module} — 保存模块配置值 */
export async function updateSiteSettingValues(
  module: string,
  body: API.SiteSettingUpdateRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBoolean>(
    `/admin/site-settings/${encodeURIComponent(module)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  )
}

/** POST /admin/site-settings/{module}/reset — 将模块配置重置为默认值 */
export async function resetSiteSettingModule(
  module: string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBoolean>(
    `/admin/site-settings/${encodeURIComponent(module)}/reset`,
    {
      method: 'POST',
      ...(options || {}),
    },
  )
}

/** POST /admin/site-settings/integration/test — 保存前测试第三方集成连通性 */
export async function testIntegrationConnection(
  body: API.IntegrationTestRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseIntegrationTestResultVO>(
    '/admin/site-settings/integration/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  )
}

/** GET /admin/site-settings/audit — 分页查询配置变更审计记录 */
export async function pageSiteSettingAudit(
  params?: API.SiteSettingAuditQueryRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageSiteSettingAuditVO>('/admin/site-settings/audit', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** GET /admin/site-settings/health — 批量探测各集成目标健康状态 */
export async function listSiteSettingHealth(options?: { [key: string]: unknown }) {
  return request<API.BaseResponseListIntegrationTestResultVO>('/admin/site-settings/health', {
    method: 'GET',
    ...(options || {}),
  })
}

/** POST /admin/site-settings/health/{target} — 对单个集成目标发起健康探测 */
export async function testSiteSettingHealth(
  target: string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseIntegrationTestResultVO>(
    `/admin/site-settings/health/${encodeURIComponent(target)}`,
    {
      method: 'POST',
      ...(options || {}),
    },
  )
}
