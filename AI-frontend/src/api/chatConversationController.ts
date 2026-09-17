/**
 * 对话会话管理 API — 对应后端 ChatConversationController，接口前缀 /chat/conversations
 * 负责会话的增删查、会话内消息分页查询以及默认会话的解析/复用。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 分页查询会话列表 GET /chat/conversations */
export async function listConversations(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listConversationsParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseListChatConversationVO>('/chat/conversations', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 创建会话 POST /chat/conversations — 返回新建的会话对象 */
export async function createConversation(
  body: API.ChatConversationCreateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseChatConversationVO>('/chat/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取会话详情 GET /chat/conversations/${id} */
export async function getConversation(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getConversationParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseChatConversationVO>(`/chat/conversations/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 删除会话 DELETE /chat/conversations/${id} — 同时清理其下消息 */
export async function deleteConversation(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteConversationParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseBoolean>(`/chat/conversations/${param0}`, {
    method: 'DELETE',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 分页查询会话消息 GET /chat/conversations/${id}/messages — 默认第 1 页、每页 20 条 */
export async function listMessages(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listMessagesParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponsePageChatMessageVO>(`/chat/conversations/${param0}/messages`, {
    method: 'GET',
    params: {
      // pageNum has a default value: 1
      pageNum: '1',
      // pageSize has a default value: 20
      pageSize: '20',
      ...queryParams,
    },
    ...(options || {}),
  })
}

/** 解析/获取默认会话 POST /chat/conversations/resolve — 无则按请求创建，用于进入页面时兜底 */
export async function resolveDefault(
  body: API.ChatConversationResolveRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseChatConversationVO>('/chat/conversations/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
