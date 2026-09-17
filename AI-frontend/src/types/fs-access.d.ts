// File System Access API：TypeScript DOM lib 尚未收录的成员。
// 仅声明本地音乐库扫描（src/integrations/pulseLocalLibrary.ts）实际用到的部分。
// 迭代目录时 lib 的 FileSystemHandle 不按 kind 收窄，调用侧用显式断言细化。

interface FileSystemHandlePermissionQuery {
  mode?: 'read' | 'readwrite'
}

interface FileSystemFileHandle {
  /** 查询权限状态（不弹窗），返回 'granted' | 'denied' | 'prompt' */
  queryPermission(desc?: FileSystemHandlePermissionQuery): Promise<PermissionState>
  /** 向用户申请权限，可能触发浏览器授权弹窗 */
  requestPermission(desc?: FileSystemHandlePermissionQuery): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  /** 异步迭代目录直属子项，产出 [名称, handle] 二元组 */
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

/** 目录选择器选项 */
interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string
}

/** 文件选择器选项 */
interface OpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface Window {
  /** 打开目录选择器，返回所选目录句柄 */
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  /** 打开文件选择器，返回所选文件句柄数组 */
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
}
