/**
 * EchoBot 宠物设备 API — 对应后端 PetDeviceController，接口前缀 /pet/devices
 * 所有请求 silent404：模块未启用时接口 404，由调用方按需降级
 */
import request from '@/request'

/** POST /pet/devices — 绑定 EchoBot 设备，明文 token 仅返回一次 */
export async function bindPetDevice(
  body?: { deviceName?: string; clientInfo?: string },
  options?: { [key: string]: any },
) {
  return request<API.BaseResponsePetDeviceBindVO>('/pet/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body ?? {},
    ...(options || {}),
    silent404: true,
  })
}

/** GET /pet/devices */
export async function listPetDevices(options?: { [key: string]: any }) {
  return request<API.BaseResponseListPetDeviceVO>('/pet/devices', {
    method: 'GET',
    ...(options || {}),
    silent404: true,
  })
}

/** POST /pet/devices/revoke */
export async function revokePetDevice(body: { id: number }, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/pet/devices/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
    silent404: true,
  })
}
