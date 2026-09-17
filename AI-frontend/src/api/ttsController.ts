/**
 * 语音合成（TTS）API — 对应后端 TtsController，接口前缀 /tts
 * 提供合成配置/健康状态查询、文本合成（分片返回）与音色库管理。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 获取 TTS 配置 GET /tts/config — 引擎类型、默认参数等 */
export async function config(options?: { [key: string]: any }) {
  return request<API.BaseResponseTtsConfigVO>('/tts/config', {
    method: 'GET',
    ...(options || {}),
  })
}

/** TTS 健康检查 GET /tts/health — 判断服务是否可用 */
export async function health(options?: { [key: string]: any }) {
  return request<API.BaseResponseTtsHealthVO>('/tts/health', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 初始化参考音频 POST /tts/ref/init — 上传参考音用作音色克隆基底 */
export async function initRef(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.initRefParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/tts/ref/init', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 文本合成 POST /tts/synthesize — 返回音频分片数组，按序播放 */
export async function synthesize(body: API.TtsSynthesizeRequest, options?: { [key: string]: any }) {
  return request<string[]>('/tts/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 新增音色 POST /tts/voice/add — 返回音色 id */
export async function addVoice(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.addVoiceParams,
  body: {},
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/tts/voice/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      ...params,
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除音色 POST /tts/voice/delete — 按 id 删除 */
export async function deleteVoice(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/tts/voice/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取音色详情 GET /tts/voice/get */
export async function getVoice(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getVoiceParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseTtsVoiceVO>('/tts/voice/get', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 获取全部音色列表 GET /tts/voice/list */
export async function listVoices(options?: { [key: string]: any }) {
  return request<API.BaseResponseListTtsVoiceVO>('/tts/voice/list', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 选定使用中的音色 POST /tts/voice/select */
export async function selectVoice(
  body: API.TtsVoiceSelectRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/tts/voice/select', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新音色信息 POST /tts/voice/update */
export async function updateVoice(
  body: API.TtsVoiceUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/tts/voice/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
