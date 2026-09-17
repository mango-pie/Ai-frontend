/**
 * 聊天历史记录 API — 对应后端 ChatHistoryController，接口前缀 /chatHistory
 * 负责对话消息（用户/AI/错误）的落库保存、按应用或用户维度分页查询及管理端检索。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 管理端分页查询聊天历史 GET /chatHistory/admin/list — 展开嵌套查询对象到平铺参数 */
export async function listChatHistoryByPageForAdmin(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listChatHistoryByPageForAdminParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageChatHistoryVO>('/chatHistory/admin/list', {
    method: 'GET',
    params: {
      ...params,
      chatHistoryQueryRequest: undefined,
      ...params['chatHistoryQueryRequest'],
    },
    ...(options || {}),
  })
}

/** 保存 AI 回复消息 POST /chatHistory/aiMessage — 返回消息 id */
export async function saveAiMessage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.saveAiMessageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/chatHistory/aiMessage', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 分页查询指定应用的聊天历史 GET /chatHistory/app/${appId} — 默认每页 10 条 */
export async function listAppChatHistory(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listAppChatHistoryParams,
  options?: { [key: string]: any }
) {
  const { appId: param0, ...queryParams } = params
  return request<API.BaseResponsePageChatHistory>(`/chatHistory/app/${param0}`, {
    method: 'GET',
    params: {
      // pageSize has a default value: 10
      pageSize: '10',
      ...queryParams,
    },
    ...(options || {}),
  })
}

/** 按应用 id 删除聊天历史 DELETE /chatHistory/deleteByAppId */
export async function deleteByAppId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteByAppIdParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/chatHistory/deleteByAppId', {
    method: 'DELETE',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 保存错误消息 POST /chatHistory/errorMessage — 记录调用失败的异常信息 */
export async function saveErrorMessage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.saveErrorMessageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/chatHistory/errorMessage', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 查询最近聊天记录 GET /chatHistory/latest — 默认取 10 条 */
export async function getLatestChatHistory(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getLatestChatHistoryParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseListChatHistoryVO>('/chatHistory/latest', {
    method: 'GET',
    params: {
      // limit has a default value: 10
      limit: '10',
      ...params,
    },
    ...(options || {}),
  })
}

/** 用户侧分页查询聊天历史 GET /chatHistory/list — 展开嵌套查询对象到平铺参数 */
export async function listChatHistoryByPage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listChatHistoryByPageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageChatHistoryVO>('/chatHistory/list', {
    method: 'GET',
    params: {
      ...params,
      chatHistoryQueryRequest: undefined,
      ...params['chatHistoryQueryRequest'],
    },
    ...(options || {}),
  })
}

/** 保存用户消息 POST /chatHistory/userMessage — 返回消息 id */
export async function saveUserMessage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.saveUserMessageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/chatHistory/userMessage', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}
