<script setup lang="ts">
/** 实验室入口横幅卡：整卡可点跳转 /lab，按钮上的箭头悬停时右移做引导动效。 */
import { useRouter } from 'vue-router'
import { FlaskConical, ArrowRight } from 'lucide-vue-next'
import { siteConfig } from '@/config/site'

const router = useRouter()
</script>

<template>
  <!-- 整卡可点击；按钮 stop 阻止冒泡但仍执行同一跳转 -->
  <section class="lab-entry" @click="router.push('/lab')">
    <div class="lab-entry__icon">
      <FlaskConical :size="24" />
    </div>
    <div class="lab-entry__content">
      <h3 class="lab-entry__title">{{ siteConfig.labPage.entryTitle }}</h3>
      <p class="lab-entry__desc">{{ siteConfig.labPage.entryDesc }}</p>
    </div>
    <a-button type="primary" class="lab-entry__btn" @click.stop="router.push('/lab')">
      {{ siteConfig.labPage.entryAction }}
      <ArrowRight :size="16" class="lab-entry__btn-icon" />
    </a-button>
  </section>
</template>

<style scoped>
.lab-entry {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 28px;
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(232, 121, 169, 0.25);
  background: linear-gradient(135deg, rgba(232, 121, 169, 0.08) 0%, rgba(124, 156, 224, 0.08) 100%);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.lab-entry:hover {
  border-color: rgba(232, 121, 169, 0.45);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.lab-entry__icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 22px;
}

.lab-entry__content {
  flex: 1;
  min-width: 0;
}

.lab-entry__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.lab-entry__desc {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.lab-entry__btn {
  flex-shrink: 0;
  background: var(--gradient-primary) !important;
  border: none !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lab-entry__btn-icon {
  transition: transform var(--transition-fast);
}

.lab-entry:hover .lab-entry__btn-icon,
.lab-entry__btn:hover .lab-entry__btn-icon {
  transform: translateX(4px);
}

@media (prefers-reduced-motion: reduce) {
  .lab-entry__btn-icon {
    transition: none;
  }
  .lab-entry:hover .lab-entry__btn-icon,
  .lab-entry__btn:hover .lab-entry__btn-icon {
    transform: none;
  }
}

@media (max-width: 768px) {
  .lab-entry {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .lab-entry__btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
