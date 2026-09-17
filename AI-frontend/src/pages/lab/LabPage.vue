<script setup lang="ts">
/**
 * 实验室页（路由 /lab）：三栏「实验台」布局
 * - 左栏实验须知，主栏提示词调配单（LabCreatePanel）+ 我的实验样品架（分页/删除），右栏灵感试纸与统计
 * - 外层套 StationRoomShell 复用站点房间框架（含 Esc 回门厅）
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { listMyAppByPage, deleteApp } from '@/api/appController'
import { useLoginUserStore } from '@/stores/loginUser'
import { siteConfig } from '@/config/site'
import { Edit, FlaskConical, LogIn, Sparkles, Trash2 } from 'lucide-vue-next'
import LabCreatePanel from '@/components/lab/LabCreatePanel.vue'
import IconAction from '@/components/ui/IconAction.vue'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'

/** 把时间戳转成「x 分钟/小时/天/周/月前」的相对时间文案 */
function fromNow(str: string | undefined) {
  if (!str) return ''
  const diff = Date.now() - new Date(str).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return mins + ' 分钟前'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + ' 小时前'
  const days = Math.floor(hours / 24)
  if (days < 7) return days + ' 天前'
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks + ' 周前'
  return Math.floor(days / 30) + ' 个月前'
}

const router = useRouter()
const loginUserStore = useLoginUserStore()
const createPanelRef = ref<InstanceType<typeof LabCreatePanel>>()

// 我的实验列表与分页参数（样品架每页摆 8 个）
const myApps = ref<API.AppVO[]>([])
const myTotal = ref(0)
const myLoading = ref(false)
const mySearchParams = reactive({ pageNum: 1, pageSize: 8 })

// 站点配置的灵感提示词，点击后注入主栏调配单
const quickPrompts = computed(() => siteConfig.quickPrompts || [])

const injectPrompt = (text: string) => {
  createPanelRef.value?.setPrompt(text)
}

/** 分页拉取当前登录用户的实验列表（未登录直接跳过） */
const fetchMyApps = async () => {
  if (!loginUserStore.loginUser.id) return
  myLoading.value = true
  try {
    const res = await listMyAppByPage({ ...mySearchParams })
    if (res.data.code === 0 && res.data.data) {
      myApps.value = res.data.data.records || []
      myTotal.value = res.data.data.totalRow || 0
    }
  } finally {
    myLoading.value = false
  }
}

const onMyPageChange = (page: number) => {
  mySearchParams.pageNum = page
  fetchMyApps()
}

/** 二次确认后删除实验作品并刷新样品架 */
const doDeleteMyApp = (id: number | undefined) => {
  Modal.confirm({
    title: '确认删除该实验作品吗？',
    okText: '确认',
    okType: 'danger',
    onOk: async () => {
      const res = await deleteApp({ id })
      if (res.data.code === 0) {
        message.success('删除成功')
        fetchMyApps()
      } else {
        message.error('删除失败，' + res.data.message)
      }
    },
  })
}

onMounted(() => {
  fetchMyApps()
})
</script>

<template>
  <StationRoomShell brand-path="/lab" note-label="Lab · 灵感实验" room="lab">
    <div id="labPage" class="lab-room">
      <!-- 左栏：实验台须知 -->
      <aside class="lab-room__side">
        <section class="station-glass side-card">
          <p class="eyebrow">WORKBENCH</p>
          <h3 class="side-card__title font-display">关于实验室</h3>
          <p class="side-card__text">
            一句话描述想法，实验台会把它酿成一个可运行的小应用。
            作品会架上中栏的样品架，生成过程可以离开页面。
          </p>
        </section>
        <section class="station-glass side-card">
          <p class="eyebrow">SAFETY NOTES</p>
          <ul class="side-card__rules">
            <li>试剂（提示词）写得越具体，成晶越稳定</li>
            <li>生成中可以离开，回来样品架上取</li>
            <li>失败的作品可以整瓶重试，不必可惜</li>
            <li><b>Esc</b> 回到门厅</li>
          </ul>
          <span class="side-card__tape" aria-hidden="true" />
        </section>
      </aside>

      <!-- 主栏：调配单 + 样品架 -->
      <main class="lab-room__main">
        <header class="lab-room__header">
          <p class="eyebrow">LAB · 实验台</p>
          <h1 class="lab-room__title font-display">
            <FlaskConical :size="26" :stroke-width="2" class="lab-room__title-icon" />
            {{ siteConfig.heroLabTitle }}
          </h1>
          <p class="lab-room__sub">{{ siteConfig.labPage.subtitle }}</p>
        </header>

        <!-- 试剂调配单：创建应用的提示词输入 -->
        <section class="station-glass lab-room__bench">
          <p class="lab-room__bench-label">试剂调配单 · RECIPE</p>
          <LabCreatePanel ref="createPanelRef" />
        </section>

        <!-- 样品架：已登录显示我的实验列表，未登录显示登录引导 -->
        <section v-if="loginUserStore.loginUser.id" class="lab-room__shelf">
          <div class="lab-room__shelf-head">
            <span class="lab-room__shelf-title font-display">{{ siteConfig.sections.myExperiments }}</span>
            <span class="lab-room__shelf-count">{{ myTotal }} 个实验</span>
          </div>
          <p v-if="myLoading" class="lab-room__hint">样品架上正在清点…</p>
          <div v-else-if="!myApps.length" class="lab-room__empty">
            <FlaskConical :size="30" :stroke-width="1.5" />
            <p>空瓶先立着占个位——{{ siteConfig.sections.emptyMyApps }}</p>
          </div>
          <div v-else class="vial-grid">
            <article
              v-for="(app, i) in myApps"
              :key="app.id"
              class="vial-card"
              @click="router.push('/app/chat/' + app.id)"
            >
              <div class="vial-card__cover">
                <img v-if="app.cover" :src="app.cover" alt="封面" />
                <span v-else class="vial-card__placeholder font-display">
                  {{ app.appName ? app.appName.slice(0, 2) : '实验' }}
                </span>
                <span class="vial-card__no">NO.{{ String((mySearchParams.pageNum - 1) * mySearchParams.pageSize + i + 1).padStart(2, '0') }}</span>
                <div class="vial-card__actions">
                  <IconAction
                    :icon="Edit"
                    variant="soft"
                    size="sm"
                    aria-label="编辑"
                    @click.stop="router.push('/app/edit/' + app.id)"
                  />
                  <IconAction
                    :icon="Trash2"
                    variant="danger"
                    size="sm"
                    motion="shake"
                    aria-label="删除"
                    @click.stop="doDeleteMyApp(app.id)"
                  />
                </div>
              </div>
              <div class="vial-card__info">
                <span class="vial-card__name">{{ app.appName || '未命名实验' }}</span>
                <span class="vial-card__time">{{ fromNow(app.createTime) }}</span>
              </div>
            </article>
          </div>
          <div v-if="myTotal > 8" class="lab-room__pagination">
            <a-pagination
              :current="mySearchParams.pageNum"
              :page-size="mySearchParams.pageSize"
              :total="myTotal"
              show-less-items
              @change="onMyPageChange"
            />
          </div>
        </section>

        <section v-else class="station-glass lab-room__login">
          <p>登录后可在此查看和管理你的实验作品</p>
          <IconAction :icon="LogIn" label="去登录" variant="primary" @click="router.push('/user/login')" />
        </section>
      </main>

      <!-- 右栏：灵感试纸 -->
      <aside class="lab-room__deck">
        <section class="station-glass deck-card">
          <header class="deck-card__head">
            <Sparkles :size="14" :stroke-width="2" />
            <h3 class="font-display">灵感试纸</h3>
          </header>
          <p class="deck-card__hint">点一张试纸，配方自动落入调配单。</p>
          <div class="ph-strip">
            <button
              v-for="(p, i) in quickPrompts"
              :key="p"
              type="button"
              class="ph-strip__paper"
              :style="{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (1 + (i % 3))}deg)` }"
              @click="injectPrompt(p)"
            >
              {{ p }}
            </button>
          </div>
        </section>

        <section class="station-glass deck-card">
          <header class="deck-card__head">
            <FlaskConical :size="14" :stroke-width="2" />
            <h3 class="font-display">实验台统计</h3>
          </header>
          <dl class="deck-stats">
            <div>
              <dt>上架作品</dt>
              <dd class="font-display">{{ myTotal }}</dd>
            </div>
            <div>
              <dt>本页样品</dt>
              <dd class="font-display">{{ myApps.length }}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  </StationRoomShell>
</template>
<style scoped>
.lab-room {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 300px;
  gap: 22px;
  align-items: start;
  min-height: 100%;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 2.5px;
  color: color-mix(in srgb, var(--room) 78%, #5b5470);
  font-weight: 700;
  margin: 0 0 6px;
}

/* ── 左栏 ── */
.lab-room__side {
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
.side-card__text,
.side-card__rules {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft, #6c6580);
}
.side-card__rules {
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
}
.side-card__rules b {
  color: color-mix(in srgb, var(--room) 80%, #4c3f60);
  margin-right: 4px;
}
.side-card__tape {
  position: absolute;
  top: -9px;
  right: 18px;
  width: 74px;
  height: 18px;
  background: color-mix(in srgb, var(--room) 38%, #fff);
  opacity: 0.75;
  transform: rotate(-4deg);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(70, 55, 100, 0.18);
}

/* ── 主栏 ── */
.lab-room__header {
  margin-bottom: 16px;
}
.lab-room__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 34px;
  line-height: 1.15;
  color: var(--ink, #38304a);
}
.lab-room__title-icon {
  color: var(--room);
}
.lab-room__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft, #6c6580);
}
.lab-room__bench {
  padding: 16px 18px 14px;
  margin-bottom: 18px;
}
.lab-room__bench-label {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--ink-faint, #9a94ad);
}
.lab-room__shelf-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.lab-room__shelf-title {
  font-size: 19px;
  color: var(--ink, #38304a);
}
.lab-room__shelf-count {
  font-size: 12px;
  color: var(--ink-faint, #9a94ad);
}
.lab-room__hint {
  margin: 0;
  padding: 18px;
  font-size: 13px;
  color: var(--ink-faint, #9a94ad);
  background: rgba(255, 255, 255, 0.55);
  border: 1.5px dashed color-mix(in srgb, var(--room) 40%, transparent);
  border-radius: 16px;
}
.lab-room__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 18px;
  color: var(--ink-faint, #9a94ad);
  background: rgba(255, 255, 255, 0.55);
  border: 1.5px dashed color-mix(in srgb, var(--room) 40%, transparent);
  border-radius: 16px;
}
.lab-room__empty p {
  margin: 0;
  font-size: 13px;
}
/* 样品瓶卡片网格 */
.vial-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}
.vial-card {
  cursor: pointer;
  background: var(--craft-glass);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--shadow-1);
  transition: transform 0.25s var(--ease-out), box-shadow 0.25s;
}
.vial-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--room) 26%, transparent);
}
.vial-card__cover {
  position: relative;
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--room) 14%, #fff);
  overflow: hidden;
}
.vial-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.vial-card__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: color-mix(in srgb, var(--room) 70%, #6a5b85);
}
.vial-card__no {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 9px;
  letter-spacing: 1.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink-soft, #6c6580);
}
.vial-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.vial-card:hover .vial-card__actions {
  opacity: 1;
}
.vial-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px 12px;
}
.vial-card__name {
  font-size: 13.5px;
  color: var(--ink, #38304a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vial-card__time {
  font-size: 11px;
  color: var(--ink-faint, #9a94ad);
}
.lab-room__pagination {
  margin-top: 14px;
  display: flex;
  justify-content: center;
}
.lab-room__login {
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.lab-room__login p {
  margin: 0;
  font-size: 13.5px;
  color: var(--ink-soft, #6c6580);
}

/* ── 右栏 ── */
.lab-room__deck {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.deck-card {
  padding: 16px;
}
.deck-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: color-mix(in srgb, var(--room) 80%, #4c3f60);
}
.deck-card__head h3 {
  margin: 0;
  font-size: 15px;
}
.deck-card__hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-faint, #9a94ad);
}
/* 灵感试纸：斜条纹试纸卡，hover 时摆正并浮起 */
.ph-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ph-strip__paper {
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ink, #38304a);
  background: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.9),
    rgba(255, 255, 255, 0.9) 6px,
    color-mix(in srgb, var(--room) 8%, #fff) 6px,
    color-mix(in srgb, var(--room) 8%, #fff) 12px
  );
  border: 1px solid color-mix(in srgb, var(--room) 30%, transparent);
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(80, 60, 110, 0.12);
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s;
}
.ph-strip__paper:hover {
  transform: rotate(0deg) translateY(-2px) !important;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--room) 30%, transparent);
}
.deck-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}
.deck-stats > div {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--room) 18%, transparent);
}
.deck-stats dt {
  font-size: 11px;
  color: var(--ink-faint, #9a94ad);
}
.deck-stats dd {
  margin: 2px 0 0;
  font-size: 22px;
  color: color-mix(in srgb, var(--room) 82%, #4c3f60);
}

/* 窄屏时收窄三栏 */
@media (max-width: 1500px) {
  .lab-room {
    grid-template-columns: 220px minmax(0, 1fr) 260px;
  }
}
</style>
