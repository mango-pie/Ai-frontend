<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import { ExperimentOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
import { siteConfig } from '@/config/site'
import { useCapabilitiesStore } from '@/stores/capabilities'

const router = useRouter()
const visible = computed(() => useCapabilitiesStore().enabled('app-lab'))
</script>

<template>
  <section v-if="visible" class="lab-entry" @click="router.push('/lab')">
    <div class="lab-entry__icon">
      <ExperimentOutlined />
    </div>
    <div class="lab-entry__content">
      <h3 class="lab-entry__title">{{ siteConfig.labPage.entryTitle }}</h3>
      <p class="lab-entry__desc">{{ siteConfig.labPage.entryDesc }}</p>
    </div>
    <a-button type="primary" class="lab-entry__btn" @click.stop="router.push('/lab')">
      {{ siteConfig.labPage.entryAction }}
      <ArrowRightOutlined />
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
