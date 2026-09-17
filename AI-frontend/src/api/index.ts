/**
 * API 汇总出口（openapi 自动生成并维护）
 * 将各业务 Controller 模块聚合成命名空间对象默认导出，
 * 页面代码可通过 `api.xxxController.yyy()` 的方式统一调用后端接口。
 */
// @ts-ignore
/* eslint-disable */
// API 更新时间：
// API 唯一标识：
import * as userController from './userController'
import * as imageUploadController from './imageUploadController'
import * as ttsController from './ttsController'
import * as studyTaskController from './studyTaskController'
import * as studyListController from './studyListController'
import * as studyHabitController from './studyHabitController'
import * as studyFocusController from './studyFocusController'
import * as studyChecklistController from './studyChecklistController'
import * as diaryEntryController from './diaryEntryController'
import * as chatHistoryController from './chatHistoryController'
import * as chatConversationController from './chatConversationController'
import * as chatController from './chatController'
import * as blogTagController from './blogTagController'
import * as blogPostTagController from './blogPostTagController'
import * as blogPostController from './blogPostController'
import * as blogImageController from './blogImageController'
import * as blogCategoryController from './blogCategoryController'
import * as appController from './appController'
import * as test from './test'
import * as studyWorkspaceController from './studyWorkspaceController'
import * as studyStatsController from './studyStatsController'
export default {
  userController,
  imageUploadController,
  ttsController,
  studyTaskController,
  studyListController,
  studyHabitController,
  studyFocusController,
  studyChecklistController,
  diaryEntryController,
  chatHistoryController,
  chatConversationController,
  chatController,
  blogTagController,
  blogPostTagController,
  blogPostController,
  blogImageController,
  blogCategoryController,
  appController,
  test,
  studyWorkspaceController,
  studyStatsController,
}
