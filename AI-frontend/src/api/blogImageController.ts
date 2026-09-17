/**
 * 博客图片 API — 对应后端 BlogImageController，接口前缀 /blog/image
 * 提供博客配图的上传、与文章的绑定/解绑、状态更新及分页查询。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 将图片绑定到文章 POST /blog/image/bind/post */
export async function bindImageToPost(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.bindImageToPostParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/image/bind/post', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 删除图片记录 POST /blog/image/delete — 按 id 删除 */
export async function deleteImage(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/blog/image/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取图片详情 GET /blog/image/get/vo */
export async function getImageVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getImageVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBlogImageVO>('/blog/image/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 查询文章配图列表 GET /blog/image/list/by/post/${postId} */
export async function getImagesByPostId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getImagesByPostIdParams,
  options?: { [key: string]: any }
) {
  const { postId: param0, ...queryParams } = params
  return request<API.BaseResponseListBlogImage>(`/blog/image/list/by/post/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 分页查询图片 POST /blog/image/list/page/vo — 图库管理列表 */
export async function queryImagePage(
  body: API.BlogImageQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageBlogImageVO>('/blog/image/list/page/vo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新图片状态 POST /blog/image/update/status — 如启用/弃用 */
export async function updateImageStatus(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.updateImageStatusParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/image/update/status', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 上传博客图片 POST /blog/image/upload — 返回图片记录 id */
export async function uploadImage1(body: API.BlogImage, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/blog/image/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
