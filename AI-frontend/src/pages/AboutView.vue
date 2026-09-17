<script setup lang="ts">
/**
 * 关于页（About 房间）：
 * 纯静态展示页，数据全部来自站点配置 siteConfig，
 * 三栏布局展示站长资料、技能贴纸墙与联系方式。
 */
import { siteConfig } from '@/config/site'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

const { about } = siteConfig
</script>

<template>
  <StationRoomShell brand-path="/about" note-label="About · 站长工作台" room="about">
    <div class="about-room">
      <!-- 左栏：关于 / 技能贴纸墙 -->
      <aside class="about-room__side">
        <section class="station-glass side-card">
          <p class="eyebrow">KEEPER</p>
          <h3 class="side-card__title font-display">{{ about.title }}</h3>
          <p class="side-card__text">{{ siteConfig.bio }}</p>
        </section>
        <section class="station-glass side-card">
          <p class="eyebrow">SKILL WALL</p>
          <h3 class="side-card__title font-display">技能贴纸墙</h3>
          <div class="skill-wall">
            <span v-for="(skill, i) in about.skills" :key="skill" class="skill-sticker" :style="{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (1 + (i % 3))}deg)` }">
              {{ skill }}
            </span>
          </div>
          <span class="side-card__tape" aria-hidden="true" />
        </section>
      </aside>

      <!-- 主栏：自我介绍手账 -->
      <main class="about-room__main">
        <header class="about-room__header">
          <p class="eyebrow">ABOUT · 站长工作台</p>
          <h1 class="about-room__title font-display">{{ siteConfig.siteName }} 的站长</h1>
          <p class="about-room__sub">{{ about.techStack }}</p>
        </header>

        <section class="station-glass about-journal">
          <div class="about-journal__head">
            <a-avatar :size="88" :src="siteConfig.avatar" class="about-journal__avatar" />
            <div>
              <p class="about-journal__kana">{{ siteConfig.brandKana }}</p>
              <div class="about-journal__name font-display">{{ siteConfig.ownerName }}</div>
            </div>
          </div>
          <p class="about-journal__bio">{{ siteConfig.bio }}</p>
          <div class="about-journal__interests">
            <span class="about-journal__label">兴趣</span>
            <span v-for="item in about.interests" :key="item" class="interest-chip">{{ item }}</span>
          </div>
        </section>
      </main>

      <!-- 右栏：联系名片 -->
      <aside class="about-room__deck">
        <section class="station-glass side-card">
          <p class="eyebrow">CONTACT</p>
          <h3 class="side-card__title font-display">联系名片</h3>
          <a
            v-for="link in [about.contact.email, about.contact.github]"
            :key="link.label"
            :href="link.href"
            class="contact-card"
            :target="link.href.startsWith('http') ? '_blank' : undefined"
            rel="noopener"
          >
            {{ link.label }}
          </a>
        </section>
        <section class="station-glass side-card">
          <p class="eyebrow">STATION</p>
          <h3 class="side-card__title font-display">本站</h3>
          <p class="side-card__text">由 {{ about.techStack }} 搭建 · 欢迎随便逛逛各个房间。</p>
        </section>
      </aside>
    </div>
  </StationRoomShell>
</template>

<style scoped>
.about-room {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 300px;
  gap: 22px;
  align-items: start;
  min-height: 100%;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 2.5px;
  color: color-mix(in srgb, var(--room) 78%, #6b5560);
  font-weight: 700;
  margin: 0 0 6px;
}

.about-room__side,
.about-room__deck {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.side-card {
  position: relative;
  padding: 18px 18px 16px;
}
.side-card__title {
  margin: 0 0 8px;
  font-size: 18px;
}
.side-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft, #6d5f66);
}
.side-card__tape {
  position: absolute;
  top: -9px;
  right: 18px;
  width: 74px;
  height: 18px;
  background: color-mix(in srgb, var(--room) 38%, #fff);
  opacity: 0.75;
  transform: rotate(3deg);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(90, 55, 70, 0.18);
}

.skill-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.skill-sticker {
  display: inline-block;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--ink, #3d3242);
  background: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.92),
    rgba(255, 255, 255, 0.92) 5px,
    color-mix(in srgb, var(--room) 10%, #fff) 5px,
    color-mix(in srgb, var(--room) 10%, #fff) 10px
  );
  border: 1px solid color-mix(in srgb, var(--room) 32%, transparent);
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(90, 55, 70, 0.14);
  transition: transform 0.2s var(--ease-out);
}
.skill-sticker:hover {
  transform: rotate(0deg) translateY(-2px) !important;
}

.about-room__header {
  margin-bottom: 16px;
}
.about-room__title {
  margin: 0;
  font-size: 34px;
  line-height: 1.15;
  color: var(--ink, #3d3242);
}
.about-room__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft, #6d5f66);
}

.about-journal {
  padding: 22px 24px;
}
.about-journal__head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.about-journal__avatar {
  border: 3px solid color-mix(in srgb, var(--room) 45%, #fff);
  font-family: 'ZCOOL KuaiLe', 'PingFang SC', sans-serif;
  font-size: 30px;
}
.about-journal__kana {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 3px;
  color: var(--ink-faint, #a294a0);
}
.about-journal__name {
  font-size: 24px;
  color: var(--ink, #3d3242);
}
.about-journal__bio {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 2;
  color: var(--ink-soft, #6d5f66);
}
.about-journal__interests {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.about-journal__label {
  font-size: 12px;
  color: var(--ink-faint, #a294a0);
  margin-right: 2px;
}
.interest-chip {
  padding: 3px 12px;
  font-size: 12px;
  border-radius: 999px;
  color: color-mix(in srgb, var(--room) 75%, #5c444f);
  background: color-mix(in srgb, var(--room) 12%, #fff);
  border: 1px solid color-mix(in srgb, var(--room) 30%, transparent);
}

.contact-card {
  display: block;
  margin-bottom: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--ink, #3d3242);
  text-decoration: none;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid color-mix(in srgb, var(--room) 24%, transparent);
  border-radius: 12px;
  transition: border-color 0.2s, background 0.2s, transform 0.2s var(--ease-out);
}
.contact-card:hover {
  background: #fff;
  border-color: color-mix(in srgb, var(--room) 55%, transparent);
  transform: translateY(-2px);
}

@media (max-width: 1500px) {
  .about-room {
    grid-template-columns: 220px minmax(0, 1fr) 260px;
  }
}
</style>
