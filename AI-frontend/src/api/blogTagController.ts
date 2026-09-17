/**
 * 博客标签 API — 对应后端 BlogTagController，接口前缀 /blog/tag
 * 提供标签的增删改查、分页检索与标签云数据。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增标签 POST /blog/tag/add — 返回标签 id */
export async function addTag(body: API.BlogTagAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/blog/tag/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除标签 POST /blog/tag/delete — 按 id 删除 */
export async function deleteTag(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/blog/tag/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取标签详情 GET /blog/tag/get/vo */
export async function getTagVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getTagVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBlogTagVO>('/blog/tag/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 获取全部标签 GET /blog/tag/list/all — 供打标签下拉框使用 */
export async function getAllTags(options?: { [key: string]: any }) {
  return request<API.BaseResponseListBlogTag>('/blog/tag/list/all', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 获取标签云 GET /blog/tag/list/cloud — 按引用次数加权的标签视图 */
export async function getTagCloud(options?: { [key: string]: any }) {
  return request<API.BaseResponseListBlogTagVO>('/blog/tag/list/cloud', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 分页查询标签 POST /blog/tag/list/page/vo — 管理端列表页 */
export async function queryTagPage(
  body: API.BlogTagQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageBlogTagVO>('/blog/tag/list/page/vo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新标签 POST /blog/tag/update */
export async function updateTag(body: API.BlogTagUpdateRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/blog/tag/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
