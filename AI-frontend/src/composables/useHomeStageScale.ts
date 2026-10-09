/**
 * Scale a fixed 1920-wide home "stage" page down so it always fits the viewport.
 * The stage keeps its design size and is CSS-transformed; the wrapper is resized
 * to the scaled dimensions so surrounding layout/scrollbars behave correctly.
 */
import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { HOME_PAGE_H } from '@/composables/useHomePager'

/** Design width of the stage */
export const HOME_STAGE_W = 1920
/** Visible stage = one page */
export const HOME_STAGE_H = HOME_PAGE_H

/**
 * Fit one 1920×1080 page into the viewport (width + height), no browser scroll.
 */
export function useHomeStageScale(
  stageWrapRef: Ref<HTMLElement | null>,
  stageRef: Ref<HTMLElement | null>,
) {
  const scale = ref(1)

  /** Recompute scale (never upscale, cap at 1) and apply transform + wrapper size */
  const fit = () => {
    const s = Math.min(window.innerWidth / HOME_STAGE_W, window.innerHeight / HOME_STAGE_H, 1)
    scale.value = s
    const stage = stageRef.value
    const wrap = stageWrapRef.value
    if (stage) stage.style.transform = `scale(${s})`
    if (wrap) {
      wrap.style.width = `${HOME_STAGE_W * s}px`
      wrap.style.height = `${HOME_STAGE_H * s}px`
    }
  }

  onMounted(async () => {
    // Fit twice: after nextTick (DOM settled) and once more via rAF for late layout
    await nextTick()
    fit()
    requestAnimationFrame(fit)
    window.addEventListener('resize', fit)
  })

  // Remove the resize listener so later mounts don't stack handlers
  onUnmounted(() => {
    window.removeEventListener('resize', fit)
  })

  return { scale, fit }
}
