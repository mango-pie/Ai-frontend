/**
 * 博客文章 API — 对应后端 BlogPostController，接口前缀 /blog/post
 * 提供文章的增删改查、按分类/标签/已发布维度分页浏览、
 * 点赞与浏览量自增、置顶与发布状态切换。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增文章 POST /blog/post/add — 返回文章 id */
export async function addBlogPost(body: API.BlogPostAddRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseLong>('/blog/post/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除文章 POST /blog/post/delete — 按 id 删除 */
export async function deleteBlogPost(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/blog/post/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取文章详情 GET /blog/post/get/vo */
export async function getBlogPostVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getBlogPostVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBlogPostVO>('/blog/post/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 点赞 POST /blog/post/like/${id} — 浏览量/点赞数自增 */
export async function incrementLikeCount(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.incrementLikeCountParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseBoolean>(`/blog/post/like/${param0}`, {
    method: 'POST',
    params: { ...queryParams },
    ...(options || {}),
  })
}

/** 按分类分页查询文章 GET /blog/post/list/page/category/${categoryId} — 默认第 1 页、每页 10 条 */
export async function getBlogPostPageByCategory(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getBlogPostPageByCategoryParams,
  options?: { [key: string]: any }
) {
  const { categoryId: param0, ...queryParams } = params
  return request<API.BaseResponsePageBlogPostVO>(`/blog/post/list/page/category/${param0}`, {
    method: 'GET',
    params: {
      // pageNum has a default value: 1
      pageNum: '1',
      // pageSize has a default value: 10
      pageSize: '10',
      ...queryParams,
    },
    ...(options || {}),
  })
}

/** 分页查询已发布文章 GET /blog/post/list/page/published — 门户列表页，默认每页 10 条 */
export async function getPublishedBlogPostPage(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPublishedBlogPostPageParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageBlogPostVO>('/blog/post/list/page/published', {
    method: 'GET',
    params: {
      // pageNum has a default value: 1
      pageNum: '1',
      // pageSize has a default value: 10
      pageSize: '10',
      ...params,
    },
    ...(options || {}),
  })
}

/** 按标签分页查询文章 GET /blog/post/list/page/tag/${tagId} — 默认第 1 页、每页 10 条 */
export async function getBlogPostPageByTag(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getBlogPostPageByTagParams,
  options?: { [key: string]: any }
) {
  const { tagId: param0, ...queryParams } = params
  return request<API.BaseResponsePageBlogPostVO>(`/blog/post/list/page/tag/${param0}`, {
    method: 'GET',
    params: {
      // pageNum has a default value: 1
      pageNum: '1',
      // pageSize has a default value: 10
      pageSize: '10',
      ...queryParams,
    },
    ...(options || {}),
  })
}

/** 条件分页检索文章 POST /blog/post/list/page/vo — 管理端列表（含草稿） */
export async function queryBlogPostPage(
  body: API.BlogPostQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageBlogPostVO>('/blog/post/list/page/vo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新文章内容 POST /blog/post/update */
export async function updateBlogPost(
  body: API.BlogPostUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/post/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新文章发布状态 POST /blog/post/update/status — 发布/下架/转草稿 */
export async function updateBlogPostStatus(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.updateBlogPostStatusParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/post/update/status', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 切换置顶状态 POST /blog/post/update/top */
export async function toggleTopStatus(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.toggleTopStatusParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/post/update/top', {
    method: 'POST',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 浏览量自增 POST /blog/post/view/${id} — 进入详情页时上报 */
export async function incrementViewCount(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.incrementViewCountParams,
  options?: { [key: string]: any }
) {
  const { id: param0, ...queryParams } = params
  return request<API.BaseResponseBoolean>(`/blog/post/view/${param0}`, {
    method: 'POST',
    params: { ...queryParams },
    ...(options || {}),
  })
}
