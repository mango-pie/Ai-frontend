/**
 * 博客文章-标签关联 API — 对应后端 BlogPostTagController，接口前缀 /blog/postTag
 * 维护文章与标签的多对多绑定关系（绑定、解绑、双向查询）。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 绑定标签到文章 POST /blog/postTag/add */
export async function addPostTag(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.addPostTagParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/postTag/add', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 检查关联是否存在 GET /blog/postTag/check — 判断文章是否已打该标签 */
export async function existsPostTag(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.existsPostTagParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/postTag/check', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 按标签查文章 id 列表 GET /blog/postTag/list/posts/${tagId} */
export async function getPostIdsByTagId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPostIdsByTagIdParams,
  options?: { [key: string]: any }
) {
  const { tagId: param0, ...queryParams } = params
  return request<API.BaseResponseListLong>(`/blog/postTag/list/posts/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 按文章查标签 id 列表 GET /blog/postTag/list/tags/${postId} */
export async function getTagIdsByPostId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getTagIdsByPostIdParams,
  options?: { [key: string]: any }
) {
  const { postId: param0, ...queryParams } = params
  return request<API.BaseResponseListLong>(`/blog/postTag/list/tags/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 解除文章与标签的绑定 POST /blog/postTag/remove */
export async function removePostTag(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.removePostTagParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/postTag/remove', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}
