/**
 * 知识库对话 API — 接口前缀 /kb
 * 管理知识库问答的会话与消息记录；正式问答走 SSE 流式（见页面层），
 * 此处保留同步问答接口作为联调备用。
 */
import request from '@/request'

/** GET /kb/conversations — 查询会话列表（可按知识库过滤） */
export async function listKnowledgeConversations(
  params?: { knowledgeBaseId?: number | string },
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseListKnowledgeConversationVO>('/kb/conversations', {
    method: 'GET',
    params: { ...params },
    ...(options || {}),
  })
}

/** DELETE /kb/conversations/{id} — 删除会话 */
export async function deleteKnowledgeConversation(
  id: number | string,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseBoolean>(`/kb/conversations/${id}`, {
    method: 'DELETE',
    ...(options || {}),
  })
}

/** GET /kb/conversations/{id}/messages — 分页查询会话消息（默认第 1 页、每页 50 条） */
export async function listKnowledgeMessages(
  conversationId: number | string,
  params?: { pageNum?: number; pageSize?: number },
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponsePageKnowledgeMessageVO>(
    `/kb/conversations/${conversationId}/messages`,
    {
      method: 'GET',
      params: {
        pageNum: params?.pageNum ?? 1,
        pageSize: params?.pageSize ?? 50,
      },
      ...(options || {}),
    },
  )
}

/** POST /kb/chat — 同步问答（联调备用） */
export async function knowledgeChat(
  body: API.KnowledgeChatRequest,
  options?: { [key: string]: unknown },
) {
  return request<API.BaseResponseKnowledgeChatResponse>('/kb/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  })
}
