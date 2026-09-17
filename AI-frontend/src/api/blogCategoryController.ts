/**
 * 博客分类 API — 对应后端 BlogCategoryController，接口前缀 /blog/category
 * 提供博客分类的增删改查与分页检索。
 */
// @ts-ignore
/* eslint-disable */
import request from '@/request'

/** 新增分类 POST /blog/category/add — 返回分类 id */
export async function addCategory(
  body: API.BlogCategoryAddRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseLong>('/blog/category/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 删除分类 POST /blog/category/delete — 按 id 删除 */
export async function deleteCategory(body: API.DeleteRequest, options?: { [key: string]: any }) {
  return request<API.BaseResponseBoolean>('/blog/category/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 获取分类详情 GET /blog/category/get/vo */
export async function getCategoryVo(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getCategoryVOParams,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBlogCategoryVO>('/blog/category/get/vo', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  })
}

/** 获取全部分类 GET /blog/category/list/all — 供下拉选择/侧边栏使用 */
export async function getAllCategories(options?: { [key: string]: any }) {
  return request<API.BaseResponseListBlogCategory>('/blog/category/list/all', {
    method: 'GET',
    ...(options || {}),
  })
}

/** 分页查询分类 POST /blog/category/list/page/vo — 管理端列表页 */
export async function queryCategoryPage(
  body: API.BlogCategoryQueryRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponsePageBlogCategoryVO>('/blog/category/list/page/vo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}

/** 更新分类 POST /blog/category/update */
export async function updateCategory(
  body: API.BlogCategoryUpdateRequest,
  options?: { [key: string]: any }
) {
  return request<API.BaseResponseBoolean>('/blog/category/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  })
}
