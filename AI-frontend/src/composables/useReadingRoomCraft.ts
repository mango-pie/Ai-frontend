/**
 * 阅读室装饰性交互 composable：观测站 / 回响柱阵 / 地图节点的点击彩蛋，
 * 以及「采集」页签 天线 ↔ 星系 ↔ 遥测 的整条动画编排（与设计稿预览行为对齐）。
 * 纯视觉层，不含业务数据。
 */
import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { popCraftAnim } from '@/utils/diaryCraft'

/** 星系四颗星的展示名（顺序与星图 data-i 对应） */
const STAR_NAMES = ['星尘', '流光', '涟漪', '暗斑'] as const

/** setTimeout 并登记进 timers，保证动画链可被整体取消 */
function later(timers: number[], fn: () => void, ms: number) {
  const t = window.setTimeout(fn, ms)
  timers.push(t)
  return t
}

/** 取消并清空已登记的全部定时器 */
function clearTimers(timers: number[]) {
  while (timers.length) window.clearTimeout(timers.pop())
}

/**
 * Reading-room decorative craft: toast + obs-prop / room-bars / map nodes,
 * plus ingest dish ↔ galaxy ↔ telemetry chain (design-preview parity).
 */
export function useReadingRoomCraft(
  rootRef: Ref<HTMLElement | null>,
  toast: (msg: string) => void,
) {
  const route = useRoute()
  let barRaf = 0
  let beamRaf = 0
  let ingestCleanup: (() => void) | null = null

  // 根节点点击分发：依次尝试观测站彩蛋、回响柱阵、地图节点（命中即止）
  const onRootClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const hit = t.closest('.obs-prop.craft-hit') as HTMLElement | null
    if (hit && rootRef.value?.contains(hit)) {
      e.stopPropagation()
      popCraftAnim(hit, 'is-pop', 500)
      toast(hit.dataset.craft || '观测站 · 收到')
      return
    }

    const bar = t.closest('.room-bars .rb-row b, [data-room-bars] .rb-row b') as HTMLElement | null
    if (bar && rootRef.value?.contains(bar)) {
      popCraftAnim(bar, 'is-bounce', 700)
      toast('回响 · 柱阵')
      return
    }

    const node = t.closest('.room-map .craft-node') as SVGElement | null
    if (node && rootRef.value?.contains(node)) {
      const map = node.closest('.room-map')
      map?.querySelectorAll('.craft-node').forEach((n) => n.classList.remove('is-on'))
      node.classList.add('is-on')
      toast(node.getAttribute('data-craft') || '节点 · 对准')
    }
  }

  // 键盘可达性：Enter / 空格 也能触发观测站彩蛋
  const onRootKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = e.target as HTMLElement | null
    const hit = t?.closest('.obs-prop.craft-hit') as HTMLElement | null
    if (!hit || !rootRef.value?.contains(hit)) return
    e.preventDefault()
    popCraftAnim(hit, 'is-pop', 500)
    toast(hit.dataset.craft || '观测站 · 收到')
  }

  /**
   * 绑定「采集」页签的整条交互链路（天线 / 星系 / 遥测柱）。
   * 相关 DOM 缺失时返回空清理函数；所有监听、定时器与 rAF 都汇总进返回的清理函数。
   */
  function wireIngestCraft(root: HTMLElement) {
    const dish = root.querySelector('#ingestDish') as HTMLElement | null
    const dishStatus = root.querySelector('#dishStatus') as HTMLElement | null
    const galaxy = root.querySelector('#ingestGalaxy') as HTMLElement | null
    const chart = root.querySelector('#starChart') as SVGSVGElement | null
    const telemetry = root.querySelector('#ingestTelemetry') as HTMLElement | null
    const bars = telemetry
      ? ([...telemetry.querySelectorAll('#telBars b')] as HTMLElement[])
      : []
    const stars = galaxy ? ([...galaxy.querySelectorAll('.sc-star')] as SVGElement[]) : []
    const localTimers: number[] = []

    if (!dish && !galaxy && !telemetry) return () => undefined

    const setDishStatus = (text: string) => {
      if (dishStatus) dishStatus.textContent = text
    }
    const clearFocus = () => {
      if (!galaxy) return
      galaxy.className = galaxy.className.replace(/\bis-focus-\d\b/g, '').trim()
    }
    const focusStar = (i: number | null) => {
      if (!galaxy) return
      clearFocus()
      if (i != null) galaxy.classList.add(`is-focus-${i}`)
    }
    const clearBarHot = () => bars.forEach((b) => b.classList.remove('is-hot', 'is-bounce'))
    /** 柱跳动动画；读 offsetWidth 强制 reflow，让连续触发也能重启动画 */
    const pulseBar = (i: number) => {
      const b = bars[i]
      if (!b) return
      b.classList.remove('is-bounce')
      void b.offsetWidth
      b.classList.add('is-bounce', 'is-hot')
      later(localTimers, () => b.classList.remove('is-bounce'), 750)
    }
    /** 星星闪烁动画（SVG 元素无 offsetWidth，改用 getBoundingClientRect 强制 reflow） */
    const flashStar = (i: number) => {
      const st = stars[i] as (SVGElement & { offsetWidth?: number }) | undefined
      if (!st) return
      st.classList.remove('is-flash')
      void (st as unknown as HTMLElement).getBoundingClientRect()
      st.classList.add('is-flash')
      later(localTimers, () => st.classList.remove('is-flash'), 600)
    }
    /** 天线「对准」动画与状态文案，1.1s 后回落到「静听」 */
    const aimDish = (name?: string) => {
      if (!dish) return
      dish.classList.remove('is-aim')
      void dish.offsetWidth
      dish.classList.add('is-aim')
      setDishStatus(name ? `对准 · ${name}` : '对准')
      later(localTimers, () => {
        dish.classList.remove('is-aim')
        if (!dish.classList.contains('is-scanning')) setDishStatus('静听')
      }, 1100)
    }
    const chartCenter = () => {
      if (!chart) return null
      const r = chart.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }
    }
    const starAngle = (st: Element, c: { x: number; y: number }) => {
      const r = st.getBoundingClientRect()
      return Math.atan2(r.top + r.height / 2 - c.y, r.left + r.width / 2 - c.x)
    }
    /** 两夹角的最小差（归一化到 [0, π]），用于判断星星是否被波束扫中 */
    const normDelta = (a: number, b: number) => {
      let d = a - b
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return Math.abs(d)
    }
    /** 遥测柱高实时映射星星在星图中的纵向位置（星越靠上柱越高）；第 5 根取四星均值微缩 */
    const syncBarsToStars = () => {
      const c = chartCenter()
      if (!c || !stars.length) return
      const maxR = Math.max(c.r.width, c.r.height) * 0.42 || 1
      const heights: number[] = []
      for (let i = 0; i < 4; i++) {
        const st = stars[i]
        const bar = bars[i]
        if (!st || !bar) continue
        const r = st.getBoundingClientRect()
        const y = r.top + r.height / 2 - c.y
        const t = Math.max(-1, Math.min(1, -y / maxR))
        const h = 28 + ((t + 1) * 0.5) * 60
        bar.style.height = `${h.toFixed(1)}%`
        heights.push(h)
      }
      if (bars[4] && heights.length) {
        const avg = heights.reduce((a, b) => a + b, 0) / heights.length
        bars[4].style.height = `${Math.max(22, Math.min(80, avg * 0.85)).toFixed(1)}%`
      }
    }
    // rAF 常驻循环：星系不可见（offsetParent 为 null）时跳过同步，节省性能
    const loopBars = () => {
      if (galaxy && galaxy.offsetParent !== null) syncBarsToStars()
      barRaf = requestAnimationFrame(loopBars)
    }
    /** 扫描波束从 12 点方向顺时针扫一圈；扫中的星星闪烁一次、对应遥测柱跳动一次 */
    const runBeamHighlight = (duration: number) => {
      cancelAnimationFrame(beamRaf)
      stars.forEach((st) => st.classList.remove('is-beam'))
      const t0 = performance.now()
      const startAng = -Math.PI / 2
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration)
        const beamAng = startAng + p * Math.PI * 2
        const c = chartCenter()
        if (c) {
          stars.forEach((st) => {
            const a = starAngle(st, c)
            const hit = normDelta(a, beamAng) < 0.28
            st.classList.toggle('is-beam', hit)
            if (hit && !st.dataset.beamed) {
              st.dataset.beamed = '1'
              const i = Number(st.dataset.i)
              flashStar(i)
              pulseBar(i)
            }
          })
        }
        if (p < 1) beamRaf = requestAnimationFrame(tick)
        else {
          stars.forEach((st) => {
            st.classList.remove('is-beam')
            delete st.dataset.beamed
          })
        }
      }
      beamRaf = requestAnimationFrame(tick)
    }
    /** 星系 CSS 扫描动画 + 同步跑一遍波束高亮 */
    const startSweep = () => {
      if (!galaxy) return
      galaxy.classList.remove('is-sweep')
      void galaxy.offsetWidth
      galaxy.classList.add('is-sweep')
      runBeamHighlight(1400)
      later(localTimers, () => galaxy.classList.remove('is-sweep'), 1450)
    }
    /** 天线点击后的整段编排：复位 → 160ms 起波 → 1.1s 遥测记录 → 1.75s 归位 */
    const runScanChain = () => {
      if (!dish) return
      clearTimers(localTimers)
      clearFocus()
      clearBarHot()
      stars.forEach((st) => {
        st.classList.remove('is-flash', 'is-beam')
        delete st.dataset.beamed
      })
      dish.classList.add('is-scanning')
      dish.classList.remove('is-aim')
      setDishStatus('扫描…')
      toast('扫描开始 · 天区')
      later(localTimers, () => startSweep(), 160)
      later(localTimers, () => {
        if (telemetry) {
          telemetry.classList.add('is-record')
          later(localTimers, () => telemetry.classList.remove('is-record'), 900)
        }
      }, 1100)
      later(localTimers, () => {
        dish.classList.remove('is-scanning')
        clearFocus()
        setDishStatus('静听')
      }, 1750)
    }
    /** 点击单颗星：点亮 + 聚焦 + 天线对准 + 对应遥测柱回响 */
    const pickStar = (i: number) => {
      const st = stars[i]
      if (!st) return
      clearTimers(localTimers)
      st.classList.toggle('is-lit')
      focusStar(i)
      flashStar(i)
      aimDish(STAR_NAMES[i] || '星')
      clearBarHot()
      pulseBar(i)
      toast(`对准 · ${STAR_NAMES[i] || '星'}`)
      later(localTimers, () => clearFocus(), 1400)
    }
    /** 点击准星：满天扫描（波束扫一圈 + 遥测记录） */
    const pickCross = () => {
      clearTimers(localTimers)
      clearFocus()
      startSweep()
      aimDish('满天')
      toast('准星 · 满天扫描')
      if (telemetry) {
        telemetry.classList.add('is-record')
        later(localTimers, () => telemetry.classList.remove('is-record'), 900)
      }
    }
    /** 点击遥测柱：前四根联动对应星，第 5 根触发扫天 */
    const pickBar = (i: number) => {
      clearTimers(localTimers)
      clearBarHot()
      pulseBar(i)
      if (i <= 3) {
        focusStar(i)
        flashStar(i)
        stars[i]?.classList.add('is-lit')
        aimDish(STAR_NAMES[i] || '星')
        toast(`回响 · ${STAR_NAMES[i] || '柱'}`)
        later(localTimers, () => clearFocus(), 1200)
      } else {
        aimDish('回响')
        toast('回响 · 扫天')
        startSweep()
      }
    }

    const onDish = (e: Event) => {
      e.stopPropagation()
      runScanChain()
    }
    const onGalaxyClick = (e: Event) => {
      const el = e.target as Element
      const st = el.closest('.sc-star') as SVGElement | null
      if (st) {
        pickStar(Number(st.dataset.i))
        return
      }
      if (el.closest('#scCross')) pickCross()
    }
    const onGalaxyOver = (e: Event) => {
      const st = (e.target as Element).closest('.sc-star') as SVGElement | null
      if (st) focusStar(Number(st.dataset.i))
    }
    const onGalaxyLeave = () => {
      if (!dish?.classList.contains('is-scanning')) clearFocus()
    }
    const onTelemetry = (e: Event) => {
      const b = (e.target as Element).closest('#telBars b') as HTMLElement | null
      if (b) pickBar(Number(b.dataset.i))
    }

    dish?.addEventListener('click', onDish)
    galaxy?.addEventListener('click', onGalaxyClick)
    galaxy?.addEventListener('mouseover', onGalaxyOver)
    galaxy?.addEventListener('mouseleave', onGalaxyLeave)
    telemetry?.addEventListener('click', onTelemetry)

    syncBarsToStars()
    barRaf = requestAnimationFrame(loopBars)

    return () => {
      dish?.removeEventListener('click', onDish)
      galaxy?.removeEventListener('click', onGalaxyClick)
      galaxy?.removeEventListener('mouseover', onGalaxyOver)
      galaxy?.removeEventListener('mouseleave', onGalaxyLeave)
      telemetry?.removeEventListener('click', onTelemetry)
      clearTimers(localTimers)
      cancelAnimationFrame(barRaf)
      cancelAnimationFrame(beamRaf)
      barRaf = 0
      beamRaf = 0
    }
  }

  /** 重绑采集链路：路由切换后插槽页面 DOM 会重建，推迟到下一帧再取新节点 */
  const rewireIngest = () => {
    ingestCleanup?.()
    ingestCleanup = null
    const root = rootRef.value
    if (!root) return
    // next frame so slotted page DOM is mounted
    requestAnimationFrame(() => {
      if (!rootRef.value) return
      ingestCleanup = wireIngestCraft(rootRef.value)
    })
  }

  onMounted(() => {
    const root = rootRef.value
    if (!root) return
    root.addEventListener('click', onRootClick)
    root.addEventListener('keydown', onRootKeydown)
    rewireIngest()
  })

  watch(
    () => route.path,
    () => rewireIngest(),
  )

  // 卸载：移除根监听，并取消采集链路残留的监听 / 定时器 / rAF
  onUnmounted(() => {
    const root = rootRef.value
    root?.removeEventListener('click', onRootClick)
    root?.removeEventListener('keydown', onRootKeydown)
    ingestCleanup?.()
    cancelAnimationFrame(barRaf)
    cancelAnimationFrame(beamRaf)
  })
}
