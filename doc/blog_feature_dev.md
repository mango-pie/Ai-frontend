# 博客功能开发文档

## 1. 项目概述

本文档记录了博客功能的前后端集成与完善工作，包括博客首页、文章创建/编辑页、文章详情页的功能实现。

## 2. 技术栈

### 前端技术栈
- Vue 3 (Composition API)
- TypeScript
- Ant Design Vue
- Marked (Markdown 解析)
- Highlight.js (代码高亮)

### 后端技术栈
- Spring Boot
- 已提供 RESTful API 接口

## 3. 文件结构

```
AI-frontend/
├── src/
│   ├── api/
│   │   ├── blogPostController.ts      # 文章 API 控制器
│   │   ├── blogCategoryController.ts  # 分类 API 控制器
│   │   ├── blogTagController.ts       # 标签 API 控制器
│   │   ├── blogImageController.ts     # 图片 API 控制器
│   │   ├── blogPostTagController.ts   # 文章标签关联 API 控制器
│   │   └── typings.d.ts               # 类型定义
│   └── pages/
│       └── blog/
│           ├── BlogHomePage.vue       # 博客首页
│           ├── BlogCreatePage.vue     # 文章创建/编辑页
│           └── BlogPostPage.vue       # 文章详情页
```

## 4. 功能实现

### 4.1 博客首页 (BlogHomePage.vue)

#### 功能特性
- 文章列表展示（分页）
- 分类筛选
- 标签筛选
- 搜索功能
- 点赞功能
- 标签云展示

#### 集成的 API
- `getPublishedBlogPostPage()` - 获取已发布的文章列表
- `getAllCategories()` - 获取所有分类
- `getTagCloud()` - 获取标签云
- `incrementLikeCount()` - 点赞

### 4.2 文章创建/编辑页 (BlogCreatePage.vue)

#### 功能特性
- 文章标题、摘要、内容编辑
- Markdown 编辑器与预览
- 分类选择
- 标签管理（选择现有标签或创建新标签）
- 封面图片上传
- 文章状态管理（草稿/发布）
- 编辑模式支持

#### 集成的 API
- `addBlogPost()` - 创建文章
- `updateBlogPost()` - 更新文章
- `getBlogPostVo()` - 获取文章详情（编辑模式）
- `getAllCategories()` - 获取所有分类
- `getAllTags()` - 获取所有标签
- `addTag()` - 添加新标签

### 4.3 文章详情页 (BlogPostPage.vue)

#### 功能特性
- 文章详情展示
- Markdown 内容渲染与代码高亮
- 浏览量统计
- 点赞功能
- 相关文章推荐
- 标签云展示
- 分享功能

#### 集成的 API
- `getBlogPostVo()` - 获取文章详情
- `incrementViewCount()` - 增加浏览量
- `incrementLikeCount()` - 点赞
- `getTagCloud()` - 获取标签云
- `getPublishedBlogPostPage()` - 获取相关文章

## 5. 数据结构

### 5.1 文章 (BlogPostVO)
```typescript
interface BlogPostVO {
  id?: number
  title?: string
  summary?: string
  content?: string
  coverUrl?: string
  categoryId?: number
  categoryName?: string
  userId?: number
  userName?: string
  userAvatar?: string
  viewCount?: number
  likeCount?: number
  status?: number
  statusText?: string
  isTop?: number
  sortOrder?: number
  extendInfo?: string
  tags?: BlogTagVO[]
  createdTime?: string
  updatedTime?: string
}
```

### 5.2 分类 (BlogCategoryVO)
```typescript
interface BlogCategoryVO {
  id?: number
  name?: string
  description?: string
  icon?: string
  sortOrder?: number
  status?: number
  statusText?: string
  postCount?: number
  createdTime?: string
  updatedTime?: string
}
```

### 5.3 标签 (BlogTagVO)
```typescript
interface BlogTagVO {
  id?: number
  name?: string
  description?: string
  color?: string
  count?: number
  status?: number
  statusText?: string
  createdTime?: string
  updatedTime?: string
}
```

## 6. API 接口说明

### 6.1 文章相关接口

| 接口名称 | 方法 | 路径 | 说明 |
|---------|------|------|------|
| addBlogPost | POST | /blog/post/add | 创建文章 |
| updateBlogPost | POST | /blog/post/update | 更新文章 |
| getBlogPostVo | GET | /blog/post/get/vo | 获取文章详情 |
| deleteBlogPost | POST | /blog/post/delete | 删除文章 |
| getPublishedBlogPostPage | GET | /blog/post/list/page/published | 获取已发布文章分页 |
| queryBlogPostPage | POST | /blog/post/list/page/vo | 查询文章分页 |
| getBlogPostPageByCategory | GET | /blog/post/list/page/category/{categoryId} | 按分类获取文章 |
| getBlogPostPageByTag | GET | /blog/post/list/page/tag/{tagId} | 按标签获取文章 |
| incrementViewCount | POST | /blog/post/view/{id} | 增加浏览量 |
| incrementLikeCount | POST | /blog/post/like/{id} | 点赞 |
| updateBlogPostStatus | POST | /blog/post/update/status | 更新文章状态 |
| toggleTopStatus | POST | /blog/post/update/top | 切换置顶状态 |

### 6.2 分类相关接口

| 接口名称 | 方法 | 路径 | 说明 |
|---------|------|------|------|
| addCategory | POST | /blog/category/add | 创建分类 |
| updateCategory | POST | /blog/category/update | 更新分类 |
| getCategoryVo | GET | /blog/category/get/vo | 获取分类详情 |
| deleteCategory | POST | /blog/category/delete | 删除分类 |
| getAllCategories | GET | /blog/category/list/all | 获取所有分类 |
| queryCategoryPage | POST | /blog/category/list/page/vo | 查询分类分页 |

### 6.3 标签相关接口

| 接口名称 | 方法 | 路径 | 说明 |
|---------|------|------|------|
| addTag | POST | /blog/tag/add | 创建标签 |
| updateTag | POST | /blog/tag/update | 更新标签 |
| getTagVo | GET | /blog/tag/get/vo | 获取标签详情 |
| deleteTag | POST | /blog/tag/delete | 删除标签 |
| getAllTags | GET | /blog/tag/list/all | 获取所有标签 |
| getTagCloud | GET | /blog/tag/list/cloud | 获取标签云 |
| queryTagPage | POST | /blog/tag/list/page/vo | 查询标签分页 |

### 6.4 图片相关接口

| 接口名称 | 方法 | 路径 | 说明 |
|---------|------|------|------|
| 上传图片 | POST | /blog/image/upload | 上传图片 |
| 绑定图片到文章 | POST | /blog/image/bind | 绑定图片到文章 |

## 7. 关键代码说明

### 7.1 Markdown 渲染
使用 `marked` 库解析 Markdown 内容，配合 `highlight.js` 实现代码高亮：

```typescript
import { marked } from 'marked'
import hljs from 'highlight.js'

marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true
})
```

### 7.2 图片上传
使用 FormData 实现图片上传：

```typescript
const handleImageUpload = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  // 调用上传 API
}
```

## 8. 后续优化建议

### 8.1 功能优化
- [ ] 实现图片上传与后端 API 集成
- [ ] 实现用户评论功能
- [ ] 添加文章草稿自动保存
- [ ] 实现文章历史版本管理
- [ ] 添加文章导出功能（PDF/Markdown）

### 8.2 性能优化
- [ ] 实现图片懒加载
- [ ] 添加文章列表虚拟滚动
- [ ] 优化 Markdown 渲染性能
- [ ] 添加前端数据缓存

### 8.3 用户体验优化
- [ ] 添加更多编辑器快捷键
- [ ] 实现深色主题
- [ ] 添加文章阅读进度条
- [ ] 优化移动端体验

## 9. 开发记录

| 日期 | 开发内容 | 开发人员 |
|------|---------|---------|
| 2024-01-XX | 博客首页功能完善 | AI Assistant |
| 2024-01-XX | 文章创建/编辑页功能完善 | AI Assistant |
| 2024-01-XX | 文章详情页功能完善 | AI Assistant |
| 2024-01-XX | 前后端 API 集成 | AI Assistant |

---

*文档版本：v1.0*
