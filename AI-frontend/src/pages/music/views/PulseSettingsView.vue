<script setup lang="ts">
/**
 * 设置页：网易云账号登录（验证码/扫码）、外观与房间（日夜/强调色/背景/舞台皮肤/字体/界面行为）、
 * 播放与 MV（音质/自动画中画/清晰度）、均衡器（PulseAudioLabView）与关于。
 * 顶部分区导航按钮通过锚点平滑滚动到对应卡片。
 */
import {
  FolderOpen,
  HardDrive,
  Monitor,
  Music2,
  Palette,
  Settings,
  Sun,
  Moon,
  Type,
  Zap,
} from 'lucide-vue-next'
import type { NeteaseLoginApi, PulsePlayerApi } from '@/pages/music/pulseApi'
import { ACCENT_PRESETS, ROOM_BLUR_MAX, ROOM_VEIL_MAX } from '@/composables/pulse/pulseRoomLook'
import PulseAudioLabView from './PulseAudioLabView.vue'

const props = defineProps<{ p: PulsePlayerApi; netease: NeteaseLoginApi }>()
const p = props.p
const netease = props.netease

// 设置分区导航（锚点 id 与图标）
const sectionNav = [
  { id: 'account', label: '账号', icon: Monitor },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'playback', label: '播放', icon: Zap },
  { id: 'audio', label: '均衡器', icon: Music2 },
  { id: 'about', label: '关于', icon: Settings },
] as const

// 平滑滚动到某个设置分区
function scrollTo(id: string) {
  const el = document.getElementById(`settings-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 预设强调色列表（含自定义取色器用的当前 hex）
const accentOptions = Object.entries(ACCENT_PRESETS).map(([id, v]) => ({ id, ...v }))

// 背景模糊/幕布滑条：幕布以百分比展示、按 0~1 存储所以除回 100
function onRoomBlurInput(e: Event) {
  p.setRoomBlur(Number((e.target as HTMLInputElement).value))
}

function onRoomVeilInput(e: Event) {
  p.setRoomVeil(Number((e.target as HTMLInputElement).value) / 100)
}
</script>

<template>
  <!-- SETTINGS：账号 / 外观 / 播放 / 均衡器 / 关于 -->
  <section class="view" :class="{ 'is-active': p.view.value === 'settings' }" aria-labelledby="settingsTitle">
    <div class="page-shell">
      <header class="page-heading">
        <div class="page-heading-copy">
          <span class="page-eyebrow">SYSTEM</span>
          <h1 id="settingsTitle">系统与连接</h1>
          <p>账号、外观、播放与音频都归这里管。本地文件和下载目录在「本地」页。</p>
        </div>
        <nav class="settings-nav" aria-label="设置分区">
          <button
            v-for="item in sectionNav"
            :key="item.id"
            class="settings-nav-btn"
            type="button"
            @click="scrollTo(item.id)"
          >
            <component :is="item.icon" :size="13" :stroke-width="2" aria-hidden="true" />
            {{ item.label }}
          </button>
        </nav>
      </header>

      <div class="settings-layout">
        <!-- 账号 -->
        <section id="settings-account" class="content-panel settings-card settings-anchor">
          <header class="panel-head">
            <span class="panel-index">ACCOUNT</span>
            <h2>网易云登录</h2>
            <span class="spacer" />
            <span v-if="netease.isLoggedIn.value" class="source-badge">已连接</span>
          </header>

          <div v-if="netease.isLoggedIn.value" class="netease-account">
            <div class="netease-account-row">
              <img
                v-if="netease.loginInfo.value.avatar"
                class="netease-avatar"
                :src="netease.loginInfo.value.avatar"
                alt=""
                referrerpolicy="no-referrer"
              />
              <span v-else class="netease-avatar netease-avatar--empty" aria-hidden="true">N</span>
              <div class="now-copy">
                <strong>{{ netease.loginInfo.value.nickname || '已登录' }}</strong>
                <small>{{ netease.loginStatusText.value }}</small>
              </div>
              <button class="action-button" type="button" @click="netease.handleLogout()">退出</button>
            </div>
          </div>

          <div v-else class="netease-login">
            <div class="provider-strip" aria-label="登录方式">
              <button
                class="provider-chip"
                :class="{ 'is-active': netease.loginMode.value === 'phone' }"
                type="button"
                @click="netease.loginMode.value = 'phone'; netease.cancelQrLogin()"
              >
                手机验证码
              </button>
              <button
                class="provider-chip"
                :class="{ 'is-active': netease.loginMode.value === 'qr' }"
                type="button"
                @click="netease.loginMode.value = 'qr'"
              >
                扫码登录
              </button>
            </div>

            <div v-if="netease.loginMode.value === 'phone'" class="netease-phone-form">
              <label class="netease-field">
                <span>手机号</span>
                <div class="netease-phone-row">
                  <input
                    v-model="netease.countrycode.value"
                    class="netease-cc"
                    type="text"
                    inputmode="numeric"
                    maxlength="4"
                    aria-label="国家区号"
                  />
                  <input
                    v-model="netease.phone.value"
                    type="tel"
                    inputmode="numeric"
                    maxlength="11"
                    placeholder="11 位手机号"
                    autocomplete="tel"
                  />
                </div>
              </label>
              <label class="netease-field">
                <span>验证码</span>
                <div class="netease-captcha-row">
                  <input
                    v-model="netease.captcha.value"
                    type="text"
                    inputmode="numeric"
                    maxlength="8"
                    placeholder="短信验证码"
                    autocomplete="one-time-code"
                    @keydown.enter="netease.loginWithPhone()"
                  />
                  <button
                    class="action-button"
                    type="button"
                    :disabled="!netease.canSendCaptcha.value"
                    @click="netease.sendCaptcha()"
                  >
                    {{
                      netease.captchaSending.value
                        ? '发送中…'
                        : netease.captchaCooldown.value > 0
                          ? `${netease.captchaCooldown.value}s`
                          : '获取验证码'
                    }}
                  </button>
                </div>
              </label>
              <div class="button-row">
                <button
                  class="action-button primary"
                  type="button"
                  :disabled="!netease.canSubmitPhoneLogin.value"
                  @click="netease.loginWithPhone()"
                >
                  {{ netease.phoneLogging.value ? '登录中…' : '登录' }}
                </button>
              </div>
              <p class="netease-hint">验证码由网易云发送。需本地音乐服务可用。</p>
            </div>

            <div v-else class="netease-qr-form">
              <div v-if="netease.qrCodeUrl.value" class="netease-qr-wrap">
                <img :src="netease.qrCodeUrl.value" alt="网易云登录二维码" class="netease-qr" />
              </div>
              <div class="button-row">
                <button
                  class="action-button primary"
                  type="button"
                  :disabled="netease.loginStatus.value === 'logging'"
                  @click="netease.handleLogin()"
                >
                  {{
                    netease.loginStatus.value === 'logging'
                      ? netease.loginStatusText.value
                      : netease.qrCodeUrl.value
                        ? '刷新二维码'
                        : '生成二维码'
                  }}
                </button>
                <button
                  v-if="netease.loginStatus.value === 'logging'"
                  class="action-button"
                  type="button"
                  @click="netease.cancelQrLogin()"
                >
                  取消
                </button>
              </div>
              <p class="netease-hint">打开网易云 App 扫码确认。</p>
            </div>

            <p v-if="netease.loginError.value" class="netease-error" role="alert">
              {{ netease.loginError.value }}
            </p>
          </div>
        </section>

        <!-- 外观 -->
        <section id="settings-appearance" class="content-panel settings-card settings-card--appearance settings-anchor">
          <header class="panel-head">
            <span class="panel-index">APPEARANCE</span>
            <h2>外观与房间</h2>
          </header>

          <div class="settings-stack">
            <div class="setting-line">
              <div><strong>日夜模式</strong><small>顶栏也可随时切换</small></div>
              <div class="segmented segmented--sm" role="group" aria-label="日夜模式">
                <button
                  class="segment"
                  :class="{ 'is-active': p.roomMode.value === 'day' }"
                  type="button"
                  @click="p.setRoomMode('day')"
                >
                  <Sun :size="12" :stroke-width="2" aria-hidden="true" /> 日间
                </button>
                <button
                  class="segment"
                  :class="{ 'is-active': p.roomMode.value === 'night' }"
                  type="button"
                  @click="p.setRoomMode('night')"
                >
                  <Moon :size="12" :stroke-width="2" aria-hidden="true" /> 夜间
                </button>
              </div>
            </div>

            <div class="setting-line setting-line--column">
              <div><strong>强调色</strong><small>整个房间的 accent 都会跟着换</small></div>
              <div class="tone-palette">
                <button
                  v-for="opt in accentOptions"
                  :key="opt.id"
                  class="tone-swatch"
                  :class="{ 'is-active': p.accentPreset.value === opt.id }"
                  type="button"
                  :style="{ '--swatch': p.roomMode.value === 'day' ? opt.day : opt.night }"
                  :aria-label="opt.label"
                  :title="opt.label"
                  @click="p.setAccentPreset(opt.id as 'iris' | 'amber' | 'rose' | 'mint')"
                />
                <label class="tone-picker-wrap" :class="{ 'is-active': p.accentPreset.value === 'custom' }">
                  <input
                    class="tone-picker"
                    type="color"
                    :value="p.accentHex.value"
                    aria-label="自定义强调色"
                    @input="p.setAccentHex(($event.target as HTMLInputElement).value)"
                  />
                </label>
                <code class="tone-hex">{{ p.accentHex.value }}</code>
              </div>
            </div>

            <div class="setting-line">
              <div><strong>背景轮播</strong><small>需要提前放入背景图</small></div>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="p.roomBg.value === 'anime'"
                  @change="p.setRoomBg(($event.target as HTMLInputElement).checked ? 'anime' : 'design')"
                />
                <span class="switch-ui" />
              </label>
            </div>

            <template v-if="p.roomBg.value === 'anime'">
              <div class="setting-line">
                <div><strong>背景模糊</strong><small>{{ p.roomBlur.value }}px · 0–{{ ROOM_BLUR_MAX }}</small></div>
                <div class="inline-range">
                  <input
                    type="range"
                    min="0"
                    :max="ROOM_BLUR_MAX"
                    :value="p.roomBlur.value"
                    @input="onRoomBlurInput"
                  />
                  <output>{{ p.roomBlur.value }}</output>
                </div>
              </div>
              <div class="setting-line">
                <div><strong>背景幕布</strong><small>{{ Math.round(p.roomVeil.value * 100) }}% · 压暗背景</small></div>
                <div class="inline-range">
                  <input
                    type="range"
                    min="0"
                    :max="ROOM_VEIL_MAX * 100"
                    :value="Math.round(p.roomVeil.value * 100)"
                    @input="onRoomVeilInput"
                  />
                  <output>{{ Math.round(p.roomVeil.value * 100) }}%</output>
                </div>
              </div>
            </template>
          </div>

          <div class="settings-subhead">
            <span class="panel-index">STAGE</span>
            <h3>舞台皮肤</h3>
          </div>
          <div class="theme-options">
            <button
              class="theme-option"
              data-preview="arena"
              :class="{ 'is-active': p.stageVariant.value === 'arena' }"
              type="button"
              @click="p.setStageVariant('arena')"
            >
              Arena 强演出
            </button>
            <button
              class="theme-option"
              :class="{ 'is-active': p.stageVariant.value === 'star-river' }"
              type="button"
              @click="p.setStageVariant('star-river')"
            >
              Star River 星河
            </button>
            <button
              class="theme-option"
              data-preview="focus"
              :class="{ 'is-active': p.stageVariant.value === 'focus' }"
              type="button"
              @click="p.setStageVariant('focus')"
            >
              Focus 克制
            </button>
          </div>

          <div class="settings-subhead">
            <span class="panel-index">TYPE</span>
            <h3>界面字体</h3>
          </div>
          <div class="font-options">
            <div class="theme-options theme-options--2">
              <button
                class="theme-option font-option"
                :class="{ 'is-active': p.fontPreset.value === 'pulse' }"
                type="button"
                @click="p.setFontPreset('pulse')"
              >
                <strong>舞台默认</strong>
                <small>Chakra + Noto</small>
              </button>
              <button
                class="theme-option font-option font-option--zcool"
                :class="{ 'is-active': p.fontPreset.value === 'zcool' }"
                type="button"
                @click="p.setFontPreset('zcool')"
              >
                <strong>站酷快乐体</strong>
                <small>站点同款 ZCOOL</small>
              </button>
            </div>
          </div>

          <div class="settings-subhead">
            <span class="panel-index">UI</span>
            <h3>界面行为</h3>
          </div>
          <div class="settings-stack">
            <div class="setting-line">
              <div><strong>减少动态效果</strong><small>停用灯光与频谱动效</small></div>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="!p.motionOn.value"
                  @change="p.motionOn.value = !p.motionOn.value; p.persistPrefs(); p.syncRootClasses()"
                />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div><strong>紧凑密度</strong><small>列表一次显示更多曲目</small></div>
              <label class="switch">
                <input
                  v-model="p.compactMode.value"
                  type="checkbox"
                  @change="p.persistPrefs(); p.syncRootClasses()"
                />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div><strong>侧边栏自动收起</strong><small>移开后收成图标；关掉则一直展开</small></div>
              <label class="switch">
                <input
                  v-model="p.railAutoCollapse.value"
                  type="checkbox"
                  @change="p.persistPrefs(); p.syncRootClasses()"
                />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div><strong>舞台悬停移入</strong><small>鼠标移入中间时，封面歌名与快捷入口滑入</small></div>
              <label class="switch">
                <input
                  v-model="p.stageRevealOnHover.value"
                  type="checkbox"
                  @change="p.persistPrefs(); p.syncRootClasses()"
                />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div><strong>舞台唱片音浪</strong><small>鼠标移出中间时，封面收成旋转唱片，周围跟着频谱</small></div>
              <label class="switch">
                <input
                  v-model="p.stageConcertFx.value"
                  type="checkbox"
                  @change="p.persistPrefs(); p.syncRootClasses()"
                />
                <span class="switch-ui" />
              </label>
            </div>
          </div>
        </section>

        <!-- 播放 -->
        <section id="settings-playback" class="content-panel settings-card settings-anchor">
          <header class="panel-head">
            <span class="panel-index">PLAYBACK</span>
            <h2>播放与 MV</h2>
          </header>
          <div class="settings-stack">
            <div class="setting-line">
              <div><strong>音质</strong><small>需登录后高码率才稳定可用</small></div>
              <div class="mv-quality-group">
                <button
                  v-for="q in [
                    { id: 'standard', label: '标准' },
                    { id: 'exhigh', label: '极高' },
                    { id: 'lossless', label: '无损' },
                  ] as const"
                  :key="q.id"
                  class="theater-chip"
                  type="button"
                  :class="{ 'is-active': p.audioQuality.value === q.id }"
                  @click="p.setAudioQuality(q.id)"
                >
                  {{ q.label }}
                </button>
              </div>
            </div>
            <div class="setting-line">
              <div><strong>自动舞台画中画</strong><small>有官方 MV 且在舞台播放时自动开启 PIP</small></div>
              <label class="switch">
                <input v-model="p.mvEnabled.value" type="checkbox" @change="p.persistPrefs()" />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div><strong>MV 清晰度</strong><small>失败时自动降档</small></div>
              <div class="mv-quality-group">
                <button
                  v-for="q in [1080, 720, 480] as const"
                  :key="q"
                  class="theater-chip"
                  type="button"
                  :class="{ 'is-active': p.mvQuality.value === q }"
                  @click="p.setMvQuality(q)"
                >
                  {{ q }}p
                </button>
              </div>
            </div>
            <div class="setting-line">
              <div><strong>展示相关 MV</strong><small>画中画 / 全屏下方显示相似或歌手 MV</small></div>
              <label class="switch">
                <input
                  :checked="p.showRelatedMvs.value"
                  type="checkbox"
                  @change="p.setShowRelatedMvs(($event.target as HTMLInputElement).checked)"
                />
                <span class="switch-ui" />
              </label>
            </div>
            <div class="setting-line">
              <div>
                <strong>桌面通知</strong>
                <small>切歌与下载完成时推系统通知，去顶栏「通知」开启</small>
              </div>
              <span class="source-badge">顶栏</span>
            </div>
          </div>
        </section>

        <!-- 均衡器：单独大卡，footer EQ 图标会滚到这里 -->
        <PulseAudioLabView :p="p" />

        <!-- 关于 -->
        <footer id="settings-about" class="settings-about settings-anchor">
          <div class="settings-about-mark" aria-hidden="true">
            <Type :size="18" :stroke-width="1.6" />
          </div>
          <div class="settings-about-copy">
            <strong>MIKU/PULSE · 站点音乐房间</strong>
            <p>
              Hatsune Miku by Crypton Future Media, INC. 2007 · CC BY-NC 3.0 ·
              <a href="https://piapro.net/intl/en_for_creators.html" target="_blank" rel="noreferrer">piapro.net/license</a>
            </p>
          </div>
          <div class="settings-about-links">
            <button class="text-button" type="button" @click="p.switchView('files')">
              <HardDrive :size="13" :stroke-width="2" aria-hidden="true" />
              本地文件
            </button>
            <button class="text-button" type="button" @click="p.pickFolder()">
              <FolderOpen :size="13" :stroke-width="2" aria-hidden="true" />
              导入音频
            </button>
          </div>
        </footer>
      </div>
    </div>
  </section>
</template>
