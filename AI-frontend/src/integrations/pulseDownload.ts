/**
 * Pulse 音乐播放器的歌曲下载模块：
 * 把网易云 / Meting 远端歌曲下载到本地（音频 + ID3 标签 + 封面 + 歌词 + MV + pulse.json 元数据），
 * 按运行环境选择落盘方式 —— Tauri 桌面端写文件系统、浏览器用 File System Access 授权目录、
 * 兜底走浏览器默认下载；完成后统一回灌本地曲库（importDownloadedAudio）。
 */
import { isLocalTrack, type PulseTrack } from '@/composables/pulse/pulseTypes'
import {
  getLyricBundle,
  getMvUrl,
  getSongDetails,
  getSongUrl,
  type AudioQuality,
  type LyricLine,
  type MvQuality,
} from '@/integrations/neteaseMusic'
import { getMetingLyricRaw, getMetingUrl, type MetingServer } from '@/integrations/metingMusic'
import { isTauriRuntime, musicRuntimeFetch } from '@/integrations/musicRuntime'
import {
  importDownloadedAudio,
  importFromFsaDir,
  importFromTauriDir,
  joinPath,
  type LocalImportResult,
  type PulseSidecar,
} from '@/integrations/pulseLocalLibrary'
import { toCoverDisplayUrl } from '@/utils/musicCover'

/** 下载落盘目标：Tauri 目录 / 浏览器授权目录（FSA）/ 浏览器默认下载文件夹 */
export type DownloadSink =
  | { kind: 'tauri'; dir: string }
  | { kind: 'fsa'; dir: FileSystemDirectoryHandle }
  | { kind: 'browser-download' }

/** 单曲下载的阶段（音频/打标/封面/歌词/MV），用于进度回调 */
export type DownloadStage = 'audio' | 'tag' | 'cover' | 'lyrics' | 'mv'

/** 下载进度事件：第 index/count 首歌所处阶段，及可选的字节进度 */
export interface DownloadProgress {
  stage: DownloadStage
  title: string
  index: number
  count: number
  loaded?: number
  total?: number
}

/** 用户主动取消下载的标记错误 */
export class DownloadAbortError extends Error {
  constructor(message = '已取消下载') {
    super(message)
    this.name = 'DownloadAbortError'
  }
}

/** 判断错误是否为「用户取消」：自定义标记或浏览器 AbortError 一并视为取消 */
export function isDownloadAbortError(err: unknown) {
  return err instanceof DownloadAbortError || (err instanceof DOMException && err.name === 'AbortError')
}

/** 是否可下载：本地曲目与 blob: 临时地址不行，需要有网易云 ID / Meting 远端 / http 直链 */
export function canDownloadTrack(track: PulseTrack | null | undefined) {
  if (!track) return false
  if (isLocalTrack(track)) return false
  return !!(track.neteaseId || (track.remoteServer && track.remoteId) || (track.url && !track.url.startsWith('blob:')))
}

/** 清洗文件名中的非法字符与控制符、压缩空白并截断 80 字符，空名回落 'track' */
export function sanitizeFileStem(name: string) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || 'track'
}

/** 下载目标的人类可读名称（UI 展示「将保存到…」用） */
export function downloadSinkLabel(sink: DownloadSink) {
  if (sink.kind === 'tauri') return sink.dir
  if (sink.kind === 'fsa') return sink.dir.name || '已授权文件夹'
  return '浏览器下载文件夹'
}

/** 组装「歌手 - 标题 [ID]」形式的歌曲文件夹 / 文件名主干 */
function downloadStem(track: PulseTrack) {
  const artist = sanitizeFileStem(track.artist || '')
  const title = sanitizeFileStem(track.shortTitle || track.title || 'track')
  const base = !artist || artist === '未知歌手' || artist === '本地文件' ? title : `${artist} - ${title}`
  const id = track.neteaseId || track.remoteId
  return id ? `${base} [${sanitizeFileStem(id).slice(0, 16)}]` : base
}

/** 取回上次授权过的浏览器目录（IndexedDB 持久化的句柄，需重新确认读写权限） */
export async function rememberedFsaDir(): Promise<FileSystemDirectoryHandle | null> {
  return loadFsaDir()
}

/** 从下载目录导入本地曲库；浏览器默认下载目录无法枚举文件，返回空 */
export async function importFromDownloadSink(sink: DownloadSink): Promise<LocalImportResult[]> {
  if (sink.kind === 'tauri') return importFromTauriDir(sink.dir)
  if (sink.kind === 'fsa') return importFromFsaDir(sink.dir)
  return []
}

/** 在下载目标内为每首歌建同名子目录；浏览器默认下载没有目录概念则原样返回 */
async function ensureSongSink(sink: DownloadSink, folderName: string): Promise<DownloadSink> {
  if (sink.kind === 'tauri') {
    const { mkdir } = await import('@tauri-apps/plugin-fs')
    const dir = joinPath(sink.dir, folderName)
    await mkdir(dir, { recursive: true })
    return { kind: 'tauri', dir }
  }
  if (sink.kind === 'fsa') {
    const dir = await sink.dir.getDirectoryHandle(folderName, { create: true })
    return { kind: 'fsa', dir }
  }
  return sink
}

/** 按资源域名匹配防盗链 Referer：QQ/酷狗资源各归其主站，默认网易 */
function refererFor(url: string) {
  try {
    const host = new URL(url).hostname
    if (host.includes('qq.com') || host.includes('gtimg')) return 'https://y.qq.com/'
    if (host.includes('kugou') || host.includes('kgimg')) return 'https://www.kugou.com/'
    return 'https://music.163.com/'
  } catch {
    return 'https://music.163.com/'
  }
}

/** 浏览器环境把 http:// 升级为 https:// 避免混合内容拦截；Tauri 原生请求无此限制 */
function browserSafeUrl(url: string) {
  if (isTauriRuntime()) return url
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

/** 从 MIME 或 URL 后缀推断音频/视频扩展名，识别不出兜底 mp3/mp4 */
function extFromMimeAndUrl(mime: string, url: string, kind: 'audio' | 'video') {
  const type = mime.toLowerCase()
  if (kind === 'video') {
    if (type.includes('webm')) return '.webm'
    if (type.includes('mp4') || type.includes('mpeg')) return '.mp4'
    const fromUrl = url.match(/\.(mp4|webm|mkv|flv)(?:\?|$)/i)
    return fromUrl ? `.${fromUrl[1]!.toLowerCase()}` : '.mp4'
  }
  if (type.includes('flac')) return '.flac'
  if (type.includes('wav')) return '.wav'
  if (type.includes('ogg')) return '.ogg'
  if (type.includes('aac')) return '.aac'
  if (type.includes('mp4') || type.includes('m4a')) return '.m4a'
  if (type.includes('mpeg') || type.includes('mp3')) return '.mp3'
  const fromUrl = url.match(/\.(mp3|flac|wav|ogg|m4a|aac|opus)(?:\?|$)/i)
  return fromUrl ? `.${fromUrl[1]!.toLowerCase()}` : '.mp3'
}

/** 结构化歌词行 → 标准 LRC 文本（[mm:ss.cc] 歌词） */
function linesToLrc(lines: LyricLine[]) {
  return lines
    .map((line) => {
      const total = Math.max(0, line.time)
      const min = Math.floor(total / 60)
      const sec = total - min * 60
      const whole = Math.floor(sec)
      const cs = Math.round((sec - whole) * 100)
      return `[${String(min).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${line.text}`
    })
    .join('\n')
}

/** 取消信号已触发时抛出 DownloadAbortError，供各阶段检查点统一退出 */
function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DownloadAbortError()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  return new Blob([toArrayBuffer(bytes)], { type })
}

/* FSA 目录句柄的持久化：句柄本身可序列化存入 IndexedDB，重启后取出并重新申请读写权限 */
const FSA_DB = 'pulse-download-v1'
const FSA_STORE = 'handles'
const FSA_KEY = 'dir'

/** 打开（必要时初始化）存放目录句柄的 IndexedDB */
function openFsaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FSA_DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FSA_STORE)) req.result.createObjectStore(FSA_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 记住授权目录句柄；私有模式等写入失败静默忽略（下次重新选目录即可） */
async function saveFsaDir(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openFsaDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FSA_STORE, 'readwrite')
      tx.objectStore(FSA_STORE).put(handle, FSA_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* private mode */
  }
}

/** 读回目录句柄并重新确认读写权限（每次会话浏览器都要求再授权一次）；未记录/被拒返回 null */
async function loadFsaDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openFsaDb()
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const req = db.transaction(FSA_STORE, 'readonly').objectStore(FSA_STORE).get(FSA_KEY)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
      req.onerror = () => reject(req.error)
    })
    if (!handle) return null
    const scoped = handle as FileSystemDirectoryHandle & {
      queryPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>
      requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>
    }
    const query = scoped.queryPermission ? await scoped.queryPermission({ mode: 'readwrite' }) : 'granted'
    const perm =
      query === 'granted'
        ? 'granted'
        : scoped.requestPermission
          ? await scoped.requestPermission({ mode: 'readwrite' })
          : 'denied'
    return perm === 'granted' ? handle : null
  } catch {
    return null
  }
}

/** 上次使用的下载目标名称提示：Tauri 用路径，浏览器读持久化目录的目录名 */
export async function rememberedSinkHint(tauriDir?: string): Promise<string> {
  if (isTauriRuntime()) return tauriDir || ''
  try {
    const db = await openFsaDb()
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const req = db.transaction(FSA_STORE, 'readonly').objectStore(FSA_STORE).get(FSA_KEY)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
      req.onerror = () => reject(req.error)
    })
    return handle?.name || ''
  } catch {
    return ''
  }
}

/** 持久化用户选的下载目标：Tauri 返回路径交由调用方保存，FSA 存句柄，浏览器目标无需持久化 */
export async function persistDownloadSink(sink: DownloadSink): Promise<string | undefined> {
  if (sink.kind === 'tauri') return sink.dir
  if (sink.kind === 'fsa') await saveFsaDir(sink.dir)
  return undefined
}

/** 弹窗选择下载目标：Tauri 用系统目录选择器 → 浏览器用 showDirectoryPicker 授权 → 兜底浏览器默认下载 */
export async function pickDownloadSink(opts?: { defaultTauriPath?: string }): Promise<DownloadSink | null> {
  if (isTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    let defaultPath = opts?.defaultTauriPath
    if (!defaultPath) {
      try {
        const { downloadDir } = await import('@tauri-apps/api/path')
        defaultPath = await downloadDir()
      } catch {
        /* ignore */
      }
    }
    const dir = await open({
      directory: true,
      multiple: false,
      defaultPath,
      title: '选择保存文件夹',
    })
    if (!dir || Array.isArray(dir)) return null
    return { kind: 'tauri', dir }
  }
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const picker = window as unknown as {
        showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
      }
      const dir = await picker.showDirectoryPicker({ mode: 'readwrite' })
      return { kind: 'fsa', dir }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null
      return { kind: 'browser-download' }
    }
  }
  return { kind: 'browser-download' }
}

/** 解析本次下载目标：reuse 时优先复用记住的目标（无则回落选择器），否则弹窗新选 */
export async function resolveDownloadSink(opts?: {
  reuse?: boolean
  rememberedTauriDir?: string
}): Promise<DownloadSink | null> {
  if (opts?.reuse) {
    if (isTauriRuntime() && opts.rememberedTauriDir) {
      return { kind: 'tauri', dir: opts.rememberedTauriDir }
    }
    if (!isTauriRuntime()) {
      const fsa = await loadFsaDir()
      if (fsa) return { kind: 'fsa', dir: fsa }
      if (!('showDirectoryPicker' in window)) return { kind: 'browser-download' }
    }
  }
  return pickDownloadSink({ defaultTauriPath: opts?.rememberedTauriDir })
}

/** 流式读出响应体字节并按块汇报进度（content-length 缺失时 total=0）；空响应视为失败 */
async function readResponseBytes(
  res: Response,
  signal: AbortSignal | undefined,
  onBytes?: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  throwIfAborted(signal)
  const total = Number(res.headers.get('content-length')) || 0
  const body = res.body
  if (!body?.getReader) {
    const bytes = new Uint8Array(await res.arrayBuffer())
    onBytes?.(bytes.byteLength, bytes.byteLength)
    return bytes
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    throwIfAborted(signal)
    const { done, value } = await reader.read()
    if (done) break
    if (value?.byteLength) {
      chunks.push(value)
      loaded += value.byteLength
      onBytes?.(loaded, total)
    }
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (!out.byteLength) throw new Error('empty')
  return out
}

/**
 * 拉取音视频字节：伪装浏览器 Referer/UA 直连；浏览器环境直连跨域失败时回落 /media-proxy 中转，
 * 仍失败则提示改用桌面版。取消类错误原样上抛，不做回落。
 */
async function fetchMediaBytes(
  url: string,
  signal: AbortSignal | undefined,
  onBytes?: (loaded: number, total: number) => void,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const headers: HeadersInit = {
    Referer: refererFor(url),
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  }

  const tryFetch = async (input: string) => {
    const res = await musicRuntimeFetch(input, { headers, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const mime = res.headers.get('content-type') || ''
    const bytes = await readResponseBytes(res, signal, onBytes)
    if (!bytes.byteLength) throw new Error('empty')
    return { bytes, mime }
  }

  const target = browserSafeUrl(url)
  try {
    return await tryFetch(target)
  } catch (err) {
    if (isDownloadAbortError(err) || isTauriRuntime()) throw err
    try {
      return await tryFetch(`/media-proxy?url=${encodeURIComponent(target)}`)
    } catch (proxyErr) {
      if (isDownloadAbortError(proxyErr)) throw proxyErr
      throw new Error('网页版受跨域限制，无法拉取文件。请用桌面版下载。')
    }
  }
}

/** 浏览器兜底：Blob + 隐藏 <a download> 触发浏览器默认下载 */
function triggerBrowserDownload(data: Blob, fileName: string) {
  const href = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 8000)
}

/** 按目标类型把字节写入文件：Tauri writeFile / FSA createWritable / 浏览器触发下载 */
async function writeBytes(sink: DownloadSink, fileName: string, bytes: Uint8Array, mime: string) {
  if (sink.kind === 'tauri') {
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = joinPath(sink.dir, fileName)
    await writeFile(path, bytes)
    return { path, handle: undefined as FileSystemFileHandle | undefined }
  }
  if (sink.kind === 'fsa') {
    const handle = await sink.dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(toArrayBuffer(bytes))
    await writable.close()
    return { path: undefined as string | undefined, handle }
  }
  triggerBrowserDownload(bytesToBlob(bytes, mime || 'application/octet-stream'), fileName)
  return { path: undefined as string | undefined, handle: undefined as FileSystemFileHandle | undefined }
}

async function writeText(sink: DownloadSink, fileName: string, text: string) {
  await writeBytes(sink, fileName, new TextEncoder().encode(text), 'text/plain')
}

/** 解析可下载的播放地址：网易云 ID → 取歌 URL，Meting 远端 → 取直链，否则用曲目自带 http 直链 */
async function resolveAudioUrl(track: PulseTrack, quality: AudioQuality) {
  if (track.neteaseId) return getSongUrl(track.neteaseId, quality)
  if (track.remoteServer && track.remoteId) {
    const url = await getMetingUrl(track.remoteServer as MetingServer, track.remoteId)
    if (!url) throw new Error('该平台未返回播放地址')
    return url
  }
  if (track.url && !track.url.startsWith('blob:')) return track.url
  throw new Error('没有可下载的播放地址')
}

/** 解析原文/译文歌词，逐级回落：远端歌词接口 → 曲目缓存字段 → 结构化歌词转 LRC */
async function resolveLyricFiles(track: PulseTrack): Promise<{ lrcText: string; transLrcText: string }> {
  if (track.neteaseId) {
    const bundle = await getLyricBundle(track.neteaseId)
    return {
      lrcText: bundle.lrcText.trim() || (track.lrcText || '').trim() || (track.lyrics?.length ? linesToLrc(track.lyrics) : ''),
      transLrcText: bundle.transLrcText.trim() || (track.lrcTransText || '').trim() || (track.lyricsTranslated?.length ? linesToLrc(track.lyricsTranslated) : ''),
    }
  }
  if (track.remoteServer && track.remoteId) {
    const raw = await getMetingLyricRaw(track.remoteServer as MetingServer, track.remoteId)
    return { lrcText: raw.trim() || (track.lrcText || '').trim(), transLrcText: (track.lrcTransText || '').trim() }
  }
  return {
    lrcText: (track.lrcText || '').trim() || (track.lyrics?.length ? linesToLrc(track.lyrics) : ''),
    transLrcText: (track.lrcTransText || '').trim() || (track.lyricsTranslated?.length ? linesToLrc(track.lyricsTranslated) : ''),
  }
}

/** 解析 MV id：空串表示「已确认无 MV」直接返回，未查询过才请求歌曲详情兜底 */
export async function resolveTrackMvId(track: PulseTrack) {
  if (track.mvId) return track.mvId
  if (track.mvId === '') return ''
  if (!track.neteaseId) return ''
  const details = await getSongDetails([track.neteaseId])
  return details.get(String(track.neteaseId))?.mvId || ''
}

/** 封面真实抓取地址：Tauri 把 /netease-img 代理路径还原为 CDN 直链，浏览器走展示代理 */
function coverFetchUrl(coverUrl?: string) {
  if (!coverUrl) return ''
  if (isTauriRuntime()) {
    if (coverUrl.startsWith('/netease-img')) {
      return `https://p1.music.126.net${coverUrl.slice('/netease-img'.length)}`
    }
    return coverUrl
  }
  return toCoverDisplayUrl(coverUrl) || coverUrl
}

/** 抓取封面字节；data:/blob: 内联地址与任何失败都返回 null（封面缺失不阻断下载） */
async function fetchCoverBuffer(coverUrl: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const url = coverFetchUrl(coverUrl)
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null
  try {
    const res = await musicRuntimeFetch(url, {
      signal,
      headers: {
        Referer: 'https://music.163.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return buf.byteLength ? buf : null
  } catch {
    return null
  }
}

/** 给 MP3 写 ID3v2 标签（标题/歌手/专辑/内嵌封面）；非 MP3 或写标失败回落原始字节，取消错误上抛 */
async function embedMp3Tags(
  bytes: Uint8Array,
  fileName: string,
  mime: string,
  track: PulseTrack,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const isMp3 = fileName.toLowerCase().endsWith('.mp3') || mime.toLowerCase().includes('mpeg') || mime.toLowerCase().includes('mp3')
  if (!isMp3) return bytes
  try {
    const { ID3Writer } = await import('browser-id3-writer')
    const writer = new ID3Writer(toArrayBuffer(bytes))
    if (track.title) writer.setFrame('TIT2', track.title)
    if (track.artist) writer.setFrame('TPE1', [track.artist])
    if (track.album) writer.setFrame('TALB', track.album)
    throwIfAborted(signal)
    if (track.coverUrl) {
      const cover = await fetchCoverBuffer(track.coverUrl, signal)
      if (cover) {
        writer.setFrame('APIC', {
          type: 3 as import('browser-id3-writer').ImageType,
          data: cover,
          description: 'Cover',
        })
      }
    }
    const tagged = writer.addTag()
    return new Uint8Array(tagged)
  } catch (err) {
    if (isDownloadAbortError(err)) throw err
    return bytes
  }
}

/** 单曲下载参数：落盘目标、要哪些附属产物（歌词/MV）、音质档位、取消信号与进度回调 */
export interface DownloadTrackOptions {
  sink: DownloadSink
  includeLyrics: boolean
  includeMv: boolean
  audioQuality: AudioQuality
  mvQuality: MvQuality
  signal?: AbortSignal
  index?: number
  count?: number
  onProgress?: (progress: DownloadProgress) => void
}

/** 下载结果：回灌本地曲库的导入记录、成功的产物清单（音频/封面/歌词…）与降级警告 */
export interface DownloadTrackResult {
  imported: LocalImportResult
  parts: string[]
  warnings: string[]
}

/**
 * 下载一首歌到本地的完整流程：
 * 解析播放地址 → 拉音频字节 → 内嵌 ID3 标签 → 落盘音频/封面/歌词/MV →
 * 写 pulse.json 元数据（sidecar）→ 回灌本地曲库。封面/歌词/MV 失败只记 warning，不阻断整体。
 */
export async function downloadTrackToDisk(
  track: PulseTrack,
  opts: DownloadTrackOptions,
): Promise<DownloadTrackResult> {
  if (!canDownloadTrack(track)) throw new Error('本地文件无需再下载')
  throwIfAborted(opts.signal)

  const folderName = downloadStem(track)
  const sink = await ensureSongSink(opts.sink, folderName)
  const index = opts.index ?? 1
  const count = opts.count ?? 1
  const title = track.shortTitle || track.title
  const report = (stage: DownloadStage, loaded?: number, total?: number) => {
    opts.onProgress?.({ stage, title, index, count, loaded, total })
  }

  report('audio')
  const audioUrl = await resolveAudioUrl(track, opts.audioQuality)
  throwIfAborted(opts.signal)
  const audio = await fetchMediaBytes(audioUrl, opts.signal, (loaded, total) => report('audio', loaded, total))
  const audioExt = extFromMimeAndUrl(audio.mime, audioUrl, 'audio')
  /* 浏览器兜底下载没有子目录，文件名带上歌曲主干，避免全部混在下载文件夹里 */
  const audioName = sink.kind === 'browser-download' ? `${folderName}${audioExt}` : `audio${audioExt}`

  report('tag')
  const tagged = await embedMp3Tags(audio.bytes, audioName, audio.mime, track, opts.signal)
  throwIfAborted(opts.signal)
  const audioWrite = await writeBytes(sink, audioName, tagged, audio.mime || 'audio/mpeg')
  const parts = ['音频']
  const warnings: string[] = []

  let coverBlob: Blob | undefined
  try {
    report('cover')
    if (track.coverUrl) {
      const cover = await fetchCoverBuffer(track.coverUrl, opts.signal)
      throwIfAborted(opts.signal)
      if (cover) {
        const coverBytes = new Uint8Array(cover)
        await writeBytes(sink, sink.kind === 'browser-download' ? `${folderName}.jpg` : 'cover.jpg', coverBytes, 'image/jpeg')
        coverBlob = new Blob([cover], { type: 'image/jpeg' })
        parts.push('封面')
      } else {
        warnings.push('封面未写入')
      }
    }
  } catch (err) {
    if (isDownloadAbortError(err)) throw err
    warnings.push('封面保存失败')
  }

  let lrcText = ''
  let transLrcText = ''
  if (opts.includeLyrics) {
    try {
      report('lyrics')
      const lyrics = await resolveLyricFiles(track)
      throwIfAborted(opts.signal)
      lrcText = lyrics.lrcText
      transLrcText = lyrics.transLrcText
      if (lrcText) {
        await writeText(sink, sink.kind === 'browser-download' ? `${folderName}.lrc` : 'lyrics.lrc', lrcText)
        parts.push('歌词')
      } else {
        warnings.push('没有歌词')
      }
      if (transLrcText) {
        await writeText(sink, sink.kind === 'browser-download' ? `${folderName}.trans.lrc` : 'lyrics.trans.lrc', transLrcText)
        parts.push('译文')
      }
    } catch (err) {
      if (isDownloadAbortError(err)) throw err
      warnings.push('歌词保存失败')
    }
  }

  let localMvPath: string | undefined
  let localMvUrl: string | undefined
  let mvWriteHandle: FileSystemFileHandle | undefined
  let resolvedMvId = track.mvId || ''
  if (opts.includeMv) {
    try {
      const mvId = await resolveTrackMvId(track)
      resolvedMvId = mvId || resolvedMvId
      if (!mvId) {
        warnings.push('没有官方 MV')
      } else {
        report('mv')
        const mvUrl = await getMvUrl(mvId, opts.mvQuality)
        throwIfAborted(opts.signal)
        const mv = await fetchMediaBytes(mvUrl, opts.signal, (loaded, total) => report('mv', loaded, total))
        const mvExt = extFromMimeAndUrl(mv.mime, mvUrl, 'video')
        const mvName = sink.kind === 'browser-download' ? `${folderName}${mvExt}` : `video${mvExt}`
        const mvWrite = await writeBytes(sink, mvName, mv.bytes, mv.mime || 'video/mp4')
        localMvPath = mvWrite.path
        mvWriteHandle = mvWrite.handle
        if (mvWrite.path && isTauriRuntime()) {
          const { convertFileSrc } = await import('@tauri-apps/api/core')
          localMvUrl = convertFileSrc(mvWrite.path)
        } else if (mvWrite.handle) {
          localMvUrl = URL.createObjectURL(bytesToBlob(mv.bytes, mv.mime || 'video/mp4'))
        }
        parts.push('MV')
      }
    } catch (err) {
      if (isDownloadAbortError(err)) throw err
      warnings.push('MV 下载失败')
    }
  } else if (track.neteaseId && !resolvedMvId) {
    try {
      resolvedMvId = (await resolveTrackMvId(track)) || ''
    } catch {
      /* keep empty */
    }
  }

  /* sidecar：与音频同目录的元数据文件，重新导入时恢复来源平台与 MV 归属 */
  const sidecar: PulseSidecar = {
    version: 1,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    neteaseId: track.neteaseId,
    mvId: resolvedMvId || undefined,
    artistId: track.artistId,
    remoteServer: track.remoteServer,
    remoteId: track.remoteId,
  }
  try {
    await writeText(sink, sink.kind === 'browser-download' ? `${folderName}.pulse.json` : 'pulse.json', JSON.stringify(sidecar, null, 2))
  } catch {
    warnings.push('曲目信息未写入')
  }

  const persistKind = sink.kind === 'tauri' ? 'tauri' : sink.kind === 'fsa' ? 'fsa' : 'session'
  const imported = await importDownloadedAudio({
    bytes: tagged,
    fileName: audioName,
    mime: audio.mime,
    lrcText: lrcText || undefined,
    lrcTransText: transLrcText || undefined,
    persistKind,
    localPath: audioWrite.path,
    handle: audioWrite.handle,
    mvHandle: mvWriteHandle,
    coverBlob,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    neteaseId: track.neteaseId,
    mvId: resolvedMvId || undefined,
    artistId: track.artistId,
    remoteServer: track.remoteServer,
    remoteId: track.remoteId,
    localMvPath,
    localMvUrl,
  })

  return { imported, parts, warnings }
}
