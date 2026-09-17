/**
 * 图片上传 API — 对应后端 ImageUploadController，接口前缀 /upload
 * 提供通用图片上传、业务图片上传（带元数据）与图片删除能力。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 通用图片上传 POST /upload/common — 返回可访问的图片 URL */
export async function uploadCommonImage(body: {}, options?: { [key: string]: any }) {
  return request<API.BaseResponseString>('/upload/common', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 业务图片上传 POST /upload/image — 落库图片记录并返回上传结果 */
export async function uploadImage(body: {}, options?: { [key: string]: any }) {
  return request<API.BaseResponseImageUploadResponse>('/upload/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除图片记录 DELETE /upload/image — 按图片地址删除对应上传记录 */
export async function deleteImage1(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteImage1Params,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/upload/image', {
    method: 'DELETE',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}
