<script setup lang="ts">
/**
 * 通用图标操作按钮（全站基础 UI 件）
 * - 图标 + 可选文字，支持 primary/ghost/danger/soft 四种视觉与三档尺寸
 * - motion 属性提供悬停时的语义化图标动效（发送/旋转/抖动等），loading 时图标转为持续旋转
 */
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    icon: Component
    label?: string
    variant?: 'primary' | 'ghost' | 'danger' | 'soft'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
    loading?: boolean
    type?: 'button' | 'submit'
    ariaLabel?: string
    /** 图标悬停语义动效；默认沿用统一放大 */
    motion?: 'none' | 'send' | 'spin' | 'shake' | 'slide' | 'pop' | 'pulse' | 'wiggle'
  }>(),
  {
    variant: 'soft',
    size: 'md',
    block: false,
    disabled: false,
    loading: false,
    type: 'button',
    motion: 'none',
  },
)

/**
 * 不声明 click emit：让父组件 @click 作为原生监听透传到根 button，
 * 避免 Vue 3 将 @click 当成组件事件后，父级收不到点击。
 */
</script>

<template>
  <!-- variant/size/motion 全部以修饰类落地，便于 CSS 统一维护；loading 中视为禁用 -->
  <button
    class="icon-action"
    :class="[
      `icon-action--${variant}`,
      `icon-action--${size}`,
      `icon-action--motion-${motion}`,
      { 'icon-action--block': block, 'icon-action--icon-only': !label },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel || label"
  >
    <!-- 图标容器：loading 时 is-spin 持续旋转；图标尺寸随按钮档位联动 -->
    <span class="icon-action__icon" :class="{ 'is-spin': loading }">
      <component :is="icon" :size="size === 'lg' ? 20 : size === 'sm' ? 16 : 18" :stroke-width="2" />
    </span>
    <!-- 文案可选：不传 label 时呈现为纯图标按钮 -->
    <span v-if="label" class="icon-action__label">{{ label }}</span>
  </button>
</template>

<style scoped>
/* 基础形态：内联弹性布局，多维度过渡为悬停反馈做准备 */
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
  white-space: nowrap;
  line-height: 1;
}

.icon-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

/* 尺寸档位：block 占满一行；icon-only 时按档位裁成方形图标钮 */
.icon-action--block {
  width: 100%;
}

.icon-action--sm {
  height: 32px;
  padding: 0 10px;
  font-size: var(--font-size-sm);
}

.icon-action--md {
  height: 40px;
  padding: 0 14px;
  font-size: var(--font-size-md);
}

.icon-action--lg {
  height: 48px;
  padding: 0 18px;
  font-size: var(--font-size-lg);
}

.icon-action--icon-only.icon-action--sm {
  width: 32px;
  padding: 0;
}

.icon-action--icon-only.icon-action--md {
  width: 40px;
  padding: 0;
}

.icon-action--icon-only.icon-action--lg {
  width: 48px;
  padding: 0;
}

.icon-action__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.icon-action:hover:not(:disabled) .icon-action__icon {
  transform: scale(1.08);
}

.icon-action__icon.is-spin {
  animation: iconSpin 0.8s linear infinite;
}

@keyframes iconSpin {
  to {
    transform: rotate(360deg);
  }
}

/* 语义化悬停动效（motion prop） */
.icon-action--motion-send:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaSend 0.5s ease;
}

.icon-action--motion-spin:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaSpin 0.6s ease;
}

.icon-action--motion-shake:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaShake 0.5s ease;
}

.icon-action--motion-slide:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaSlide 0.5s ease;
}

.icon-action--motion-pop:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaPop 0.45s ease;
}

.icon-action--motion-pulse:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaPulse 0.7s ease;
}

.icon-action--motion-wiggle:hover:not(:disabled) .icon-action__icon:not(.is-spin) {
  animation: iaWiggle 0.55s ease;
}

@keyframes iaSend {
  0% {
    transform: translate(0, 0);
  }
  55% {
    transform: translate(5px, -5px);
  }
  56% {
    transform: translate(-4px, 4px);
    opacity: 0.6;
  }
  100% {
    transform: translate(0, 0);
    opacity: 1;
  }
}

@keyframes iaSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes iaShake {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-10deg);
  }
  75% {
    transform: rotate(10deg);
  }
}

@keyframes iaSlide {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(4px);
  }
}

@keyframes iaPop {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.22);
  }
  100% {
    transform: scale(1.08);
  }
}

@keyframes iaPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}

@keyframes iaWiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-12deg) translateX(-1px);
  }
  75% {
    transform: rotate(10deg) translateX(1px);
  }
}

/* 无障碍：用户偏好减少动效时关闭全部图标动画 */
@media (prefers-reduced-motion: reduce) {
  .icon-action__icon,
  .icon-action:hover:not(:disabled) .icon-action__icon {
    animation: none !important;
    transform: none !important;
  }
}

/* 四种视觉变体：primary 渐变主按钮 / soft 柔和描边 / ghost 透明 / danger 危险操作 */
.icon-action--primary {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glow);
}

.icon-action--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow-lg);
}

.icon-action--soft {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.icon-action--soft:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--color-border-hover);
}

.icon-action--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--color-text-secondary);
}

.icon-action--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
}

.icon-action--danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.icon-action--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
}
</style>
