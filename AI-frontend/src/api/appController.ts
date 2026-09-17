/**
 * AI 应用（智能体应用）API — 对应后端 AppController，接口前缀 /app
 * 管理平台内的 AI 应用：创建、更新、删除、部署、对话生成代码（SSE）
 * 以及用户侧"我的应用"与管理端应用列表的分页查询。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 模块能力探测：GET /app/modules（无需鉴权，供首屏渲染） */
export async function getAppModules(options?: { [key: string]: any }) {
  return request<API.BaseResponseAppModulesVO>('/app/modules', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 新增应用 POST /app/add — 返回应用 id */
export async function addApp(body: API.AppAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/app/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 对话式生成代码 GET /app/chat/gen/code — 以 SSE 流式返回生成过程内容 */
export async function chatToGenCode(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.chatToGenCodeParams,
  options?: { [key: string]: any }
) {
  return request<API.ServerSentEventString[]>('/app/chat/gen/code', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 删除自己的应用 POST /app/delete */
export async function deleteApp(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/app/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 管理员删除任意应用 POST /app/delete/admin */
export async function deleteAppByAdmin(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/app/delete/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 部署应用 POST /app/deploy — 返回部署结果信息 */
export async function deployApp(body: API.AppDeployRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseString>('/app/deploy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 分页查询精选应用 POST /app/featured/list/page — 门户首页推荐位 */
export async function listFeaturedAppByPage(
  body: API.AppQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageAppVO>('/app/featured/list/page', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取应用详情 GET /app/get/${id} */
export async function getAppById(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAppByIdParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseAppVO>(`/app/get/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 管理员查看应用详情 GET /app/get/admin/${id} — 可见未发布应用 */
export async function getAppByIdByAdmin(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAppByIdByAdminParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseAppVO>(`/app/get/admin/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 管理端分页查询应用 POST /app/list/page/admin */
export async function listAppByPageForAdmin(
  body: API.AppQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageAppVO>('/app/list/page/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 分页查询我的应用 POST /app/my/list/page — 当前登录用户创建的 */
export async function listMyAppByPage(body: API.AppQueryRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponsePageAppVO>('/app/my/list/page', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新自己的应用 POST /app/update */
export async function updateApp(body: API.AppUpdateRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/app/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 管理员更新任意应用 POST /app/update/admin */
export async function updateAppByAdmin(
  body: API.AppUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/app/update/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
