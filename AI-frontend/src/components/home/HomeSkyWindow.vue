<script setup lang="ts">
/**
 * 首页「天空之窗」场景卡：分层视差天空（星空/流星/日月/云/远山/拍立得）。
 * 接入全局迷你播放器（usePulsePlayer），展示当前曲目并可播放/暂停。
 * parallaxOn 开启时鼠标移动带动各 .px 图层按 data-depth 位移。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePulsePlayer } from '@/composables/usePulsePlayer'

const props = defineProps<{
  seasonCaps: [string, string]
  cloudsOn: boolean
  parallaxOn: boolean
}>()

const p = usePulsePlayer()

// ---- 视觉状态：随机生成的星星、流星位置、季节配字（切换时淡出淡入） ----
const stars = ref<{ left: string; top: string; delay: string; size: string }[]>([])
const shootingStyle = ref<Record<string, string>>({})
const shootingFly = ref(false)
const capOpacity = ref(1)
const displayCaps = ref<[string, string]>([...props.seasonCaps])

// ---- 视差跟随的插值状态：target 为鼠标目标值，px 为当前缓动值 ----
let pxTargetX = 0
let pxTargetY = 0
let pxX = 0
let pxY = 0
let rafId = 0
let shootTimer: ReturnType<typeof setInterval> | null = null
const skyRef = ref<HTMLElement | null>(null)

// ---- 迷你播放器：从全局播放器取当前曲目与进度 ----
const isPlaying = computed(() => p.isPlaying.value)
const trackTitle = computed(() => p.currentTrack.value?.title || '去音乐房间搜一首')
const trackArtist = computed(
  () => p.currentTrack.value?.artist || '舞台空闲',
)
const progressPct = computed(() => p.progressPct.value)

// 季节配字变化时先淡出旧字再换新字，避免生硬切换
watch(
  () => props.seasonCaps,
  (caps) => {
    capOpacity.value = 0
    setTimeout(() => {
      displayCaps.value = [...caps]
      capOpacity.value = 1
    }, 250)
  },
)

// 鼠标位置归一化到 [-1, 1] 作为视差目标值
const onMove = (e: MouseEvent) => {
  if (!props.parallaxOn || !skyRef.value) return
  const r = skyRef.value.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  pxTargetX = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)))
  pxTargetY = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)))
}

// 鼠标离开后视差目标回中
const onLeave = () => {
  pxTargetX = 0
  pxTargetY = 0
}

// 每帧缓动逼近目标值，再按各图层 data-depth 反向位移（近层动得多，远层动得少）
const parallaxLoop = () => {
  pxX += (pxTargetX - pxX) * 0.06
  pxY += (pxTargetY - pxY) * 0.06
  const layers = skyRef.value?.querySelectorAll<HTMLElement>('.px') || []
  for (const layer of layers) {
    if (!props.parallaxOn) {
      layer.style.transform = ''
      continue
    }
    const d = Number(layer.dataset.depth || 0)
    layer.style.transform = `translate3d(${(-pxX * d).toFixed(2)}px, ${(-pxY * d * 0.6).toFixed(2)}px, 0)`
  }
  rafId = requestAnimationFrame(parallaxLoop)
}

// 夜间主题下周期性发射一颗流星：随机起点，先重置再下一帧触发飞行动画
const launchShootingStar = () => {
  if (document.documentElement.dataset.theme !== 'night') return
  shootingStyle.value = {
    left: `${30 + Math.random() * 50}%`,
    top: `${6 + Math.random() * 26}%`,
  }
  shootingFly.value = false
  requestAnimationFrame(() => {
    shootingFly.value = true
  })
}

onMounted(() => {
  // 随机撒 34 颗星星（位置/大小/闪烁延迟随机）
  stars.value = Array.from({ length: 34 }, () => {
    const sz = 2 + Math.random() * 3
    return {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 62}%`,
      delay: `${Math.random() * 2.6}s`,
      size: `${sz}px`,
    }
  })
  rafId = requestAnimationFrame(parallaxLoop)
  shootTimer = setInterval(launchShootingStar, 5200)
})

onUnmounted(() => {
  // 停掉视差动画帧与流星定时器，防止组件销毁后仍占用主线程
  cancelAnimationFrame(rafId)
  if (shootTimer) clearInterval(shootTimer)
})

// 暴露根节点引用，供父组件定位/测量天空窗口
defineExpose({ skyRef })
</script>

<template>
  <div
    ref="skyRef"
    class="sky-window anim"
    :class="{ 'clouds-off': !cloudsOn }"
    style="animation-delay: 0.4s"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <!-- 固定氛围层：闪烁星空 / 流星 / 飞鸟 -->
    <div class="stars">
      <i
        v-for="(s, i) in stars"
        :key="i"
        :style="{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }"
      />
    </div>
    <div class="shooting" :class="{ fly: shootingFly }" :style="shootingStyle" />
    <div class="birds"><i /><i /><i /></div>

    <!-- 视差层 1：天空光晕与日月（正午太阳/黄昏太阳/月亮，主题切换显隐） -->
    <div class="px" data-depth="6">
      <div class="sky-glow" />
      <div class="sun-noon" />
      <div class="sun-rays">
        <i v-for="n in 12" :key="n" />
      </div>
      <div class="sun-dusk" />
      <div class="sky-moon" />
    </div>

    <!-- 视差层 2：漂浮云朵（cloudsOff 时由 CSS 隐藏） -->
    <div class="px" data-depth="16">
      <div class="cloud c1"><i /></div>
      <div class="cloud c2"><i /></div>
      <div class="cloud c3"><i /></div>
    </div>

    <!-- 视差层 3：远山剪影与雾气 -->
    <div class="px" data-depth="4">
      <div class="sky-mist" />
      <div class="hills">
        <svg viewBox="0 0 700 300" preserveAspectRatio="none">
          <path
            d="M0,190 C90,120 190,110 290,160 C380,205 470,130 560,150 C630,165 680,200 700,210 L700,300 L0,300 Z"
            fill="var(--hill-1)"
            opacity=".65"
          />
          <path
            d="M0,240 C110,180 230,175 330,215 C430,255 540,195 640,225 C675,236 695,248 700,252 L700,300 L0,300 Z"
            fill="var(--hill-2)"
          />
        </svg>
      </div>
    </div>

    <!-- 视差层 4：两张拍立得照片，配字为季节文案 -->
    <div class="px" data-depth="22">
      <div class="polaroid p1">
        <div class="ph" style="background: linear-gradient(160deg, #ffd9e4, #bfe6f7)" />
        <div class="cap" :style="{ opacity: capOpacity }">{{ displayCaps[0] }}</div>
      </div>
      <div class="polaroid p2">
        <div class="ph" style="background: linear-gradient(160deg, #d8ebfb, #e4dffd)" />
        <div class="cap" :style="{ opacity: capOpacity }">{{ displayCaps[1] }}</div>
      </div>
    </div>

    <!-- 视差层 5：角色立绘占位框（后续放置用户立绘） -->
    <div class="px" data-depth="10">
      <div class="standee" title="点击放置你的立绘">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-4.5-4.5L7 20" />
        </svg>
        <span class="frame-label font-display">角色立绘占位</span>
        <span class="frame-size">建议比例 3 : 4 · PNG 透明底</span>
      </div>
    </div>

    <!-- 迷你播放器：展示当前曲目/进度，播放时跳动均衡器动画 -->
    <div class="mini-player" :class="{ playing: isPlaying }">
      <div class="mp-cover" />
      <div class="mp-info">
        <div class="mp-title">{{ trackTitle }}</div>
        <div class="mp-artist">{{ trackArtist }}</div>
        <div class="mp-bar"><i :style="{ width: progressPct + '%' }" /></div>
      </div>
      <div class="mp-eq"><i /><i /><i /><i /><i /></div>
      <button type="button" class="mp-btn" aria-label="播放/暂停" @click="p.togglePlay">
        <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </div>
  </div>
</template>
