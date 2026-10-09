<script setup lang="ts">
/**
 * 分页装饰层：按 variant 输出不同的漂浮/环绕 SVG 小装饰（星星、圆环、烧瓶等）。
 * 纯视觉元素（aria-hidden），坐标与动画参数直接写在内联 style 上做错落感。
 */
withDefaults(
  defineProps<{
    variant: 'journal' | 'lab' | 'closing'
  }>(),
  { variant: 'journal' },
)
</script>

<template>
  <div class="page-deco" :class="`page-deco--${variant}`" aria-hidden="true">
    <!-- journal -->
    <template v-if="variant === 'journal'">
      <div class="deco page-deco__float" style="left: 420px; top: 110px; animation-duration: 6s">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#f490ad"
            opacity=".85"
          />
        </svg>
      </div>
      <div
        class="deco page-deco__float"
        style="left: 1680px; top: 220px; animation-duration: 7.2s; animation-delay: -2s"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#9b8ce8" stroke-width="3" opacity=".55" />
        </svg>
      </div>
      <div
        class="deco page-deco__float"
        style="left: 1520px; top: 820px; animation-duration: 5.6s; animation-delay: -1.2s"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#ffcf6e"
            opacity=".8"
          />
        </svg>
      </div>
      <div
        class="deco page-deco__float"
        style="left: 90px; top: 760px; animation-duration: 8s; animation-delay: -3.5s"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#c79ae0"
            opacity=".65"
          />
        </svg>
      </div>
    </template>

    <!-- lab -->
    <template v-else-if="variant === 'lab'">
      <div class="deco page-deco__float" style="left: 280px; top: 140px; animation-duration: 6.4s">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#5fc4a5"
            opacity=".85"
          />
        </svg>
      </div>
      <div
        class="deco page-deco__float"
        style="left: 980px; top: 90px; animation-duration: 7s; animation-delay: -1.8s"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#9b8ce8"
            opacity=".75"
          />
        </svg>
      </div>
      <div
        class="deco page-deco__float"
        style="left: 1100px; top: 520px; animation-duration: 8.2s; animation-delay: -2.6s"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#6aaee8" stroke-width="3" opacity=".5" />
        </svg>
      </div>
      <div
        class="deco page-deco__float page-deco__flask"
        style="left: 1780px; top: 160px; animation-duration: 5.8s; animation-delay: -.8s"
      >
        <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
          <path
            d="M11 2h6v8l7 16a5 5 0 0 1-4.5 7h-11A5 5 0 0 1 4 26L11 10V2z"
            stroke="#9b8ce8"
            stroke-width="2.2"
            fill="rgba(228,223,253,.55)"
          />
          <path d="M9 22h10" stroke="#9b8ce8" stroke-width="2" opacity=".5" />
        </svg>
      </div>
    </template>

    <!-- closing -->
    <template v-else>
      <div class="deco page-deco__orbit" style="--ox: -120px; --oy: -40px; animation-delay: 0s">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#f490ad"
            opacity=".9"
          />
        </svg>
      </div>
      <div class="deco page-deco__orbit" style="--ox: 130px; --oy: -55px; animation-delay: -2s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#ffcf6e"
            opacity=".85"
          />
        </svg>
      </div>
      <div class="deco page-deco__orbit" style="--ox: 145px; --oy: 70px; animation-delay: -4s">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#9b8ce8"
            opacity=".8"
          />
        </svg>
      </div>
      <div class="deco page-deco__orbit" style="--ox: -135px; --oy: 65px; animation-delay: -6s">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"
            fill="#5fc4a5"
            opacity=".8"
          />
        </svg>
      </div>
    </template>
  </div>
</template>
