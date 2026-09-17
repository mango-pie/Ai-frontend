/**
 * AI 对话 API — 对应后端 ChatController，接口前缀 /chat
 * 涵盖智能体配置读取、聊天附件上传、SSE 流式对话、多套对话配置与提示词类型查询。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 获取智能体配置 GET /chat/agent/config — 返回当前可用的 Agent 配置 */
export async function getAgentConfig(options?: { [key: string]: any }) {
  return request<API.BaseResponseChatAgentConfigVO>('/chat/agent/config', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 上传聊天附件 POST /chat/attachment — 返回附件信息供对话引用 */
export async function uploadAttachment(body: {}, options?: { [key: string]: any }) {
  return request<API.BaseResponseChatAttachmentVO>('/chat/attachment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 发起对话 POST /chat/chat — 以 SSE 流式返回分片内容，逐段渲染 AI 回复 */
export async function chat(body: API.ChatRequest, options?: { [key: string]: any }) {
  return request<API.ServerSentEventString[]>('/chat/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取全部对话配置 GET /chat/configs — 返回场景化的模型/提示词配置列表 */
export async function getConfigs(options?: { [key: string]: any }) {
  return request<API.BaseResponseListChatConfigVO>('/chat/configs', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 获取提示词类型列表 GET /chat/types — 返回可选的提示词场景枚举 */
export async function getPromptTypes(options?: { [key: string]: any }) {
  return request<API.BaseResponseStringArray>('/chat/types', {
    method: 'GET',
    ...(options || {}),
  })
}
