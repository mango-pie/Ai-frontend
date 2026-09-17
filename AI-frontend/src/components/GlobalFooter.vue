<script setup lang="ts">
/**
 * GlobalFooter 全局页脚
 * 职责：展示站点品牌、页脚快捷链接（站内路由 / 外链新窗口打开）与版权/备案信息，
 * 内容全部读取自 siteConfig 配置，组件本身不持有业务状态。
 */
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, FlaskConical, Info, Link as LinkIcon, Sparkles } from 'lucide-vue-next'
import { siteConfig } from '@/config/site'

const router = useRouter()
// 版权年份动态取当前年份，避免每年手动更新
const currentYear = new Date().getFullYear()

// 根据链接文案/路径匹配对应图标，未匹配时兜底为 Sparkles
const iconFor = (link: { label?: string; path?: string }): Component => {
  const label = link.label ?? ''
  if (label.includes('关于') || link.path === '/about') return Info
  if (label.includes('随笔') || link.path === '/blog') return BookOpen
  if (label.includes('实验') || link.path === '/lab') return FlaskConical
  if (label.includes('友链') || label.includes('链接')) return LinkIcon
  return Sparkles
}

// 链接点击分发：站内 path 走路由跳转；外部 href 新标签打开；'#' 占位链接忽略
const navigate = (link: { path?: string; href?: string }) => {
  if (link.path) {
    router.push(link.path)
  } else if (link.href && link.href !== '#') {
    window.open(link.href, '_blank')
  }
}
</script>

<template>
  <div class="global-footer">
    <div class="global-footer__content">
      <!-- 品牌区：站名 + 标语 -->
      <div class="global-footer__brand">
        <span class="global-footer__brand-text">{{ siteConfig.siteName }}</span>
        <span class="global-footer__brand-sub">{{ siteConfig.footer.tagline }}</span>
      </div>
      <!-- 快捷链接区：站内路由与外链统一渲染 -->
      <div class="global-footer__links">
        <a
          v-for="(link, i) in siteConfig.footer.links"
          :key="i"
          href="javascript:void(0)"
          class="global-footer__link"
          @click.prevent="navigate(link)"
        >
          <component :is="iconFor(link)" :size="15" class="global-footer__link-icon" />
          <span>{{ link.label }}</span>
        </a>
      </div>
      <!-- 版权与备案号（备案号未配置时不渲染） -->
      <div class="global-footer__copyright">
        © {{ currentYear }} {{ siteConfig.siteName }}
        <span v-if="siteConfig.footer.icp" class="global-footer__icp"> · {{ siteConfig.footer.icp }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.global-footer {
  padding: 40px 20px;
}

.global-footer__content {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.global-footer__brand {
  margin-bottom: 20px;
}

.global-footer__brand-text {
  display: block;
  font-size: 20px;
  font-weight: 600;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}

.global-footer__brand-sub {
  font-size: 14px;
  color: var(--color-text-muted);
}

.global-footer__links {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.global-footer__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all 0.3s ease;
  position: relative;
}

.global-footer__link-icon {
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.global-footer__link:hover .global-footer__link-icon {
  transform: translateY(-2px) scale(1.1);
  color: var(--color-primary-light);
}

@media (prefers-reduced-motion: reduce) {
  .global-footer__link-icon,
  .global-footer__link:hover .global-footer__link-icon {
    transition: none;
    transform: none;
  }
}

.global-footer__link::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--gradient-primary);
  transition: width 0.3s ease;
}

.global-footer__link:hover {
  color: var(--color-text-primary);
}

.global-footer__link:hover::after {
  width: 100%;
}

.global-footer__copyright {
  font-size: 13px;
  color: var(--color-text-muted);
}

.global-footer__icp {
  opacity: 0.8;
}

@media (max-width: 768px) {
  .global-footer {
    padding: 24px 12px;
  }

  .global-footer__links {
    gap: 16px;
  }

  .global-footer__brand-text {
    font-size: 16px;
  }
}
</style>
