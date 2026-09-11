<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { siteConfig } from '@/config/site'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { getRequiredModuleByPath } from '@/config/modules'

const router = useRouter()
const capabilitiesStore = useCapabilitiesStore()
const currentYear = new Date().getFullYear()

const footerLinks = computed(() =>
  siteConfig.footer.links.filter((link) => {
    if (!('path' in link) || !link.path) return true
    const moduleKey = getRequiredModuleByPath(link.path)
    return !moduleKey || capabilitiesStore.enabled(moduleKey)
  }),
)

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
      <div class="global-footer__brand">
        <span class="global-footer__brand-text">{{ siteConfig.siteName }}</span>
        <span class="global-footer__brand-sub">{{ siteConfig.footer.tagline }}</span>
      </div>
      <div class="global-footer__links">
        <a
          v-for="(link, i) in footerLinks"
          :key="i"
          href="javascript:void(0)"
          class="global-footer__link"
          @click.prevent="navigate(link)"
        >{{ link.label }}</a>
      </div>
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
  font-size: 14px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all 0.3s ease;
  position: relative;
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
