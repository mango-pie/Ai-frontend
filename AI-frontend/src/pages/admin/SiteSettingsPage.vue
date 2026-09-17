<script setup lang="ts">
/**
 * 全站设置中心（P0～P5）
 * 路由：/admin/settings/:module
 * schema 驱动表单；按模块分组；integration 支持测试连接；ops 走通用表单
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  bootstrapSiteSettings,
  getSiteSettingSchema,
  getSiteSettingValues,
  resetSiteSettingModule,
  testIntegrationConnection,
  updateSiteSettingValues,
} from '@/api/siteSettings'
import SiteSettingsNav from '@/components/admin/SiteSettingsNav.vue'
import StationRoomShell from '@/components/shared/StationRoomShell.vue'
import { clearAppSettingsCache } from '@/utils/appSettings'
import { clearBlogSettingsCache } from '@/utils/blogSettings'
import { clearDiarySettingsCache } from '@/utils/diarySettings'
import { clearReadingUxSettingsCache } from '@/utils/readingSettings'
import { clearStudySettingsCache } from '@/utils/studySettings'
import '@/assets/admin-theme.css'

type FormValue = string | number | boolean | null | undefined

interface SettingGroup {
  key: string
  title: string
  /** 前缀匹配（foo. / default_）或精确 key */
  prefixes: string[]
  testTarget?: string
  tip?: string
  /** reading 高级组使用折叠 */
  collapsible?: boolean
  defaultCollapsed?: boolean
}

/** 侧栏完全以 bootstrap modules 为准，不再写死分期占位 */
const UPCOMING_MODULES: API.SettingModuleVO[] = []

const MODULE_GROUPS: Record<string, SettingGroup[]> = {
  integration: [
    { key: 'knowledge_ai', title: '知识库 AI', prefixes: ['knowledge.ai.'], testTarget: 'knowledge_ai' },
    { key: 'jina', title: 'Jina', prefixes: ['knowledge.jina.'], testTarget: 'jina' },
    {
      key: 'chat',
      title: '聊天 / Agent / 图片转述 / 分段',
      prefixes: ['chat.'],
      testTarget: 'agent',
    },
    { key: 'codegen', title: '代码生成', prefixes: ['codegen.'], testTarget: 'codegen' },
    { key: 'astrbot', title: 'AstrBot', prefixes: ['astrbot.'], testTarget: 'astrbot' },
    {
      key: 'tts',
      title: 'GPT-SoVITS / TTS',
      prefixes: ['tts.'],
      testTarget: 'tts',
    },
    {
      key: 'upload_deploy',
      title: '上传与部署路径',
      prefixes: ['upload.', 'app.deploy.'],
      tip: '变更 upload.path 后静态资源映射可能仍用启动时路径，需重启生效',
    },
    { key: 'minio', title: 'MinIO', prefixes: ['knowledge.minio.'], testTarget: 'minio' },
  ],
  chat: [
    { key: 'agent', title: 'Agent', prefixes: ['agent.'] },
    { key: 'image_caption', title: '图片转述', prefixes: ['image_caption.'] },
    { key: 'segmentation', title: '朗读分段', prefixes: ['segmentation.'] },
    { key: 'attachment', title: '附件', prefixes: ['attachment_cache_ttl_minutes'] },
  ],
  tts: [
    {
      key: 'general',
      title: '总开关与语言',
      prefixes: ['enabled', 'default_'],
    },
    { key: 'seed', title: 'Seed 音色', prefixes: ['seed_voice.'] },
    {
      key: 'limits',
      title: '超时与上传限制',
      prefixes: ['connect_', 'read_', 'ref_audio.'],
    },
  ],
  knowledge: [
    { key: 'ai', title: '模型运行参数', prefixes: ['ai.'] },
    { key: 'rag', title: 'RAG', prefixes: ['rag.'] },
    { key: 'jina', title: 'Jina', prefixes: ['jina.'] },
  ],
  reading: [
    { key: 'distill', title: '蒸馏', prefixes: ['distill.'] },
    { key: 'publish', title: '发布与确认', prefixes: ['publish.', 'redistill.'] },
    {
      key: 'advanced',
      title: '高级',
      prefixes: ['search.', 'ingest.'],
      collapsible: true,
      defaultCollapsed: true,
    },
  ],
  blog: [
    { key: 'list', title: '列表', prefixes: ['list.'] },
    { key: 'post', title: '文章', prefixes: ['post.'] },
    { key: 'editor', title: '编辑器', prefixes: ['editor.'] },
  ],
  study: [
    { key: 'focus', title: '专注', prefixes: ['focus.'] },
    { key: 'habit', title: '习惯', prefixes: ['habit.'] },
    { key: 'stats_workspace', title: '统计与工作台', prefixes: ['stats.', 'workspace.'] },
  ],
  diary: [
    { key: 'privacy_export', title: '隐私与导出', prefixes: ['privacy.', 'export.'] },
    { key: 'list', title: '列表', prefixes: ['list.'] },
  ],
  app: [
    { key: 'codegen', title: '代码生成', prefixes: ['codegen.'] },
    { key: 'deploy', title: '部署', prefixes: ['deploy.'] },
  ],
  ops: [
    {
      key: 'switches',
      title: '运维开关',
      prefixes: ['debug_expose_error_detail', 'usage_log_enabled', 'usage_log_retain_days'],
    },
  ],
}

const CREDENTIAL_TIP_MODULES = new Set(['chat', 'tts', 'knowledge', 'reading', 'app'])

const TEXTAREA_KEYS = new Set([
  'frontend_public_notice',
  'tts.seed_voice.prompt_text',
  'image_caption.prompt',
  'distill.system_prompt',
])

const SIDE_EFFECT_FALLBACK: Record<string, string> = {
  'ai.embedding_dimension': '变更后需对已有文档手动重建索引，不会自动重建',
  'rag.chunk_size': '变更后需对已有文档手动重建索引，不会自动重建',
  'rag.chunk_overlap': '变更后需对已有文档手动重建索引，不会自动重建',
}

const route = useRoute()
const router = useRouter()

const bootLoading = ref(false)
const formLoading = ref(false)
const saving = ref(false)
const testingTarget = ref('')
const advancedOpenKeys = ref<string[]>([])

const bootstrap = ref<API.SiteSettingsBootstrapVO | null>(null)
const schema = ref<API.SettingModuleSchemaVO | null>(null)
const meta = ref<Record<string, API.SettingFieldMetaVO>>({})
const sensitiveHints = ref<Record<string, string>>({})
const initialSnapshot = ref<Record<string, FormValue>>({})
const formState = reactive<Record<string, FormValue>>({})

const currentModule = computed(() => {
  const fromRoute = String(route.params.module || '').trim()
  return fromRoute || 'site'
})

const activeModules = computed(() => bootstrap.value?.modules ?? [])

const sidebarModules = computed(() => {
  const activeCodes = new Set(activeModules.value.map((m) => m.code).filter(Boolean) as string[])
  const upcoming = UPCOMING_MODULES.filter((m) => m.code && !activeCodes.has(m.code))
  return [...activeModules.value, ...upcoming]
})

const isWritable = computed(() => {
  const mod = activeModules.value.find((m) => m.code === currentModule.value)
  return !!mod?.writable
})

const displayName = computed(
  () =>
    schema.value?.displayName
    || activeModules.value.find((m) => m.code === currentModule.value)?.displayName
    || currentModule.value,
)

const isIntegration = computed(() => currentModule.value === 'integration')
const showCredentialTip = computed(() => CREDENTIAL_TIP_MODULES.has(currentModule.value))

const fields = computed(() => schema.value?.fields ?? [])

const currentGroups = computed(() => MODULE_GROUPS[currentModule.value] || [])

const hasGroups = computed(() => currentGroups.value.length > 0)

function isSensitiveValue(v: unknown): v is API.SettingSensitiveValue {
  return !!v && typeof v === 'object' && 'configured' in (v as object)
}

function isTextAreaField(field: API.SettingFieldSchemaVO): boolean {
  const key = field.key || ''
  if (TEXTAREA_KEYS.has(key)) return true
  if (key.includes('notice') || key.includes('prompt')) return true
  return false
}

function fieldSource(key: string): string {
  return meta.value[key]?.source || 'default'
}

function fieldSideEffect(field: API.SettingFieldSchemaVO): string {
  const key = field.key || ''
  return field.sideEffect || SIDE_EFFECT_FALLBACK[key] || ''
}

function matchGroup(fieldKey: string, prefixes: string[]): boolean {
  return prefixes.some((p) => {
    if (p.endsWith('.') || p.endsWith('_')) return fieldKey.startsWith(p)
    return fieldKey === p || fieldKey.startsWith(`${p}.`)
  })
}

function fieldsOfGroup(group: SettingGroup): API.SettingFieldSchemaVO[] {
  return fields.value.filter((f) => f.key && matchGroup(f.key, group.prefixes))
}

const visibleGroups = computed(() =>
  currentGroups.value.filter((g) => !g.collapsible && fieldsOfGroup(g).length > 0),
)

const collapsibleGroups = computed(() =>
  currentGroups.value.filter((g) => g.collapsible && fieldsOfGroup(g).length > 0),
)

const ungroupedFields = computed(() => {
  if (!hasGroups.value) return fields.value
  return fields.value.filter((f) => {
    if (!f.key) return true
    return !currentGroups.value.some((g) => matchGroup(f.key!, g.prefixes))
  })
})

function clearFormState() {
  Object.keys(formState).forEach((k) => {
    delete formState[k]
  })
  meta.value = {}
  sensitiveHints.value = {}
  initialSnapshot.value = {}
}

function applyTemplateValues(
  fieldList: API.SettingFieldSchemaVO[],
  values: Record<string, unknown> | undefined,
  metaMap: Record<string, API.SettingFieldMetaVO> | undefined,
) {
  clearFormState()
  meta.value = metaMap || {}
  const hints: Record<string, string> = {}

  for (const field of fieldList) {
    const key = field.key
    if (!key) continue
    const raw = values?.[key]
    if (field.sensitive) {
      formState[key] = ''
      if (isSensitiveValue(raw) && raw.configured && raw.hint) {
        hints[key] = raw.hint
      }
      continue
    }
    if (field.valueType === 'bool') {
      formState[key] = Boolean(raw)
    } else if (field.valueType === 'int' || field.valueType === 'long' || field.valueType === 'double') {
      formState[key] = raw == null || raw === '' ? undefined : Number(raw)
    } else {
      formState[key] = raw == null ? '' : String(raw)
    }
  }
  sensitiveHints.value = hints
  initialSnapshot.value = { ...formState }
}

async function loadBootstrap() {
  bootLoading.value = true
  try {
    const res = await bootstrapSiteSettings()
    if (res.data.code === 0 && res.data.data) {
      bootstrap.value = res.data.data
      const modules = res.data.data.modules || []
      const codes = modules.map((m) => m.code).filter(Boolean) as string[]
      if (!codes.includes(currentModule.value) && codes.length) {
        await router.replace(`/admin/settings/${codes[0]}`)
        return
      }
    } else {
      message.error(res.data.message || '加载设置引导失败')
    }
  } catch (e) {
    message.error(apiErrorMessage(e, '加载设置引导失败'))
  } finally {
    bootLoading.value = false
  }
}

async function loadModule(moduleCode: string) {
  const exist = activeModules.value.find((m) => m.code === moduleCode)
  if (!exist) {
    schema.value = null
    clearFormState()
    return
  }
  formLoading.value = true
  advancedOpenKeys.value = []
  try {
    const [schemaRes, valuesRes] = await Promise.all([
      getSiteSettingSchema(moduleCode),
      getSiteSettingValues(moduleCode),
    ])
    if (schemaRes.data.code !== 0 || !schemaRes.data.data) {
      message.error(schemaRes.data.message || '加载 schema 失败')
      return
    }
    if (valuesRes.data.code !== 0 || !valuesRes.data.data) {
      message.error(valuesRes.data.message || '加载配置失败')
      return
    }
    schema.value = schemaRes.data.data
    applyTemplateValues(
      schemaRes.data.data.fields || [],
      valuesRes.data.data.values,
      valuesRes.data.data.meta,
    )
  } catch (e) {
    message.error(apiErrorMessage(e, '加载模块配置失败'))
  } finally {
    formLoading.value = false
  }
}

function buildItems(): Record<string, unknown> {
  const items: Record<string, unknown> = {}
  for (const field of fields.value) {
    const key = field.key
    if (!key) continue
    const value = formState[key]
    if (field.sensitive) {
      const text = value == null ? '' : String(value)
      items[key] = text.trim() ? text : ''
      continue
    }
    if (field.valueType === 'bool') {
      items[key] = Boolean(value)
    } else if (field.valueType === 'int' || field.valueType === 'long') {
      items[key] = value === '' || value == null ? null : Number(value)
    } else if (field.valueType === 'double') {
      items[key] = value === '' || value == null ? null : Number(value)
    } else {
      items[key] = value == null ? '' : value
    }
  }
  return items
}

function valueChanged(key: string, next: unknown): boolean {
  const prev = initialSnapshot.value[key]
  if (typeof next === 'boolean' || typeof prev === 'boolean') {
    return Boolean(next) !== Boolean(prev)
  }
  const a = next == null ? '' : String(next)
  const b = prev == null ? '' : String(prev)
  return a !== b
}

function collectDangerInfo(items: Record<string, unknown>): { labels: string[]; effects: string[] } {
  const labels: string[] = []
  const effects: string[] = []
  for (const field of fields.value) {
    const key = field.key
    if (!key || !field.danger) continue
    if (!(key in items)) continue
    if (field.sensitive && !String(items[key] ?? '').trim()) continue
    if (!valueChanged(key, items[key])) continue
    labels.push(field.label || key)
    const effect = fieldSideEffect(field)
    if (effect && !effects.includes(effect)) effects.push(effect)
  }
  return { labels, effects }
}

async function doSave() {
  if (!isWritable.value || saving.value) return
  const items = buildItems()
  const { labels: dangerLabels, effects } = collectDangerInfo(items)

  const run = async () => {
    saving.value = true
    try {
      const res = await updateSiteSettingValues(currentModule.value, { items })
      if (res.data.code === 0) {
        message.success('已保存，对新请求生效')
        clearModuleConsumerCache(currentModule.value)
        await loadModule(currentModule.value)
        if (currentModule.value === 'site') {
          await loadBootstrap()
        }
      } else {
        message.error(res.data.message || '保存失败')
      }
    } catch (e) {
      message.error(apiErrorMessage(e, '保存失败'))
    } finally {
      saving.value = false
    }
  }

  if (dangerLabels.length) {
    const effectText = effects.length ? `\n\n${effects.join('\n')}` : ''
    Modal.confirm({
      title: '确认保存高风险项？',
      content: `以下配置属于高风险项：${dangerLabels.join('、')}。请确认后继续。${effectText}`,
      okText: '确认保存',
      okType: 'danger',
      onOk: run,
    })
    return
  }
  await run()
}

function doReset() {
  if (!isWritable.value) return
  Modal.confirm({
    title: '恢复默认配置？',
    content: isIntegration.value
      ? '将清除本模块在数据库中的覆盖（含密钥），回落到 YAML / 环境变量默认值。'
      : '将清除本模块在数据库中的覆盖，回落到默认值。',
    okText: '恢复默认',
    okType: 'danger',
    onOk: async () => {
      try {
        const res = await resetSiteSettingModule(currentModule.value)
        if (res.data.code === 0) {
          message.success('已恢复默认')
          clearModuleConsumerCache(currentModule.value)
          await loadModule(currentModule.value)
          if (currentModule.value === 'site') {
            await loadBootstrap()
          }
        } else {
          message.error(res.data.message || '恢复失败')
        }
      } catch (e) {
        message.error(apiErrorMessage(e, '恢复失败'))
      }
    },
  })
}

async function doTest(target?: string) {
  if (!target || testingTarget.value) return
  testingTarget.value = target
  try {
    const res = await testIntegrationConnection({ target })
    if (res.data.code === 0 && res.data.data) {
      const data = res.data.data
      if (data.ok) {
        message.success(`${data.message || '连通成功'}（${data.latencyMs ?? 0}ms）`)
      } else {
        message.warning(`${data.message || '连通失败'}（${data.latencyMs ?? 0}ms）`)
      }
    } else {
      message.error(res.data.message || '测试连接失败')
    }
  } catch (e) {
    message.error(apiErrorMessage(e, '测试连接失败'))
  } finally {
    testingTarget.value = ''
  }
}

function clearModuleConsumerCache(moduleCode: string) {
  if (moduleCode === 'reading') clearReadingUxSettingsCache()
  if (moduleCode === 'blog') clearBlogSettingsCache()
  if (moduleCode === 'study') clearStudySettingsCache()
  if (moduleCode === 'diary') clearDiarySettingsCache()
  if (moduleCode === 'app') clearAppSettingsCache()
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as {
    message?: string
    response?: { data?: { message?: string } }
  }
  return err?.response?.data?.message || err?.message || fallback
}

onMounted(async () => {
  await loadBootstrap()
  if (activeModules.value.some((m) => m.code === currentModule.value)) {
    await loadModule(currentModule.value)
  }
})

watch(
  () => currentModule.value,
  async (code, prev) => {
    if (code === prev) return
    if (!bootstrap.value) return
    if (activeModules.value.some((m) => m.code === code)) {
      await loadModule(code)
    } else {
      schema.value = null
      clearFormState()
    }
  },
)
</script>

<template>
  <StationRoomShell brand-path="/" note-label="Station · 站点设置" room="settings">
  <div class="site-settings-page admin-theme-page">
    <a-breadcrumb class="admin-breadcrumb">
      <a-breadcrumb-item>
        <router-link to="/">首页</router-link>
      </a-breadcrumb-item>
      <a-breadcrumb-item>管理</a-breadcrumb-item>
      <a-breadcrumb-item>站点设置</a-breadcrumb-item>
    </a-breadcrumb>

    <div class="admin-page-hero">
      <div class="hero-left">
        <div class="hero-title">站点设置</div>
        <div class="hero-subtitle">
          {{ bootstrap?.siteName || 'Ai Scene' }}
          <template v-if="bootstrap?.siteSlogan"> · {{ bootstrap.siteSlogan }}</template>
          — 按模块管理全站可运营参数与集成密钥
        </div>
      </div>
    </div>

    <a-spin :spinning="bootLoading">
      <div class="settings-layout">
        <SiteSettingsNav :modules="sidebarModules" :active-key="currentModule" />

        <section class="settings-main">
          <a-card :bordered="false">
            <template #title>
              <div class="module-title-row">
                <span>{{ displayName }}</span>
                <a-tag v-if="isWritable" color="blue">可编辑</a-tag>
                <a-tag v-else>未接入</a-tag>
              </div>
            </template>

            <a-empty
              v-if="!isWritable"
              description="该模块尚未接入，请等待后续阶段开放"
            />

            <a-spin v-else :spinning="formLoading">
              <a-alert
                v-if="isIntegration"
                type="info"
                show-icon
                style="margin-bottom: 16px"
                message="密钥类字段留空表示不修改；已配置项仅显示后四位掩码。"
              />
              <a-alert
                v-else-if="showCredentialTip"
                type="info"
                show-icon
                style="margin-bottom: 16px"
              >
                <template #message>
                  连接地址与 API Key 请到
                  <router-link to="/admin/settings/integration">集成与密钥</router-link>
                  配置，本页仅管理行为参数。
                </template>
              </a-alert>

              <!-- 分组表单（integration / chat / tts / knowledge / reading） -->
              <template v-if="hasGroups">
                <div
                  v-for="group in visibleGroups"
                  :key="group.key"
                  class="settings-group"
                >
                  <div class="group-head">
                    <div>
                      <div class="group-title">{{ group.title }}</div>
                      <div v-if="group.tip" class="group-tip">{{ group.tip }}</div>
                    </div>
                    <a-button
                      v-if="group.testTarget"
                      size="small"
                      :loading="testingTarget === group.testTarget"
                      @click="doTest(group.testTarget)"
                    >
                      测试连接
                    </a-button>
                  </div>

                  <a-form layout="vertical" class="settings-form">
                    <a-form-item
                      v-for="field in fieldsOfGroup(group)"
                      :key="field.key"
                      :label="field.label || field.key"
                    >
                      <template #extra>
                        <div class="field-extra">
                          <span v-if="field.description">{{ field.description }}</span>
                          <a-tag
                            v-if="fieldSource(field.key!) === 'db'"
                            color="orange"
                            class="source-tag"
                          >
                            已自定义
                          </a-tag>
                          <a-tag v-if="field.danger" color="red" class="source-tag">高风险</a-tag>
                          <span
                            v-if="field.sensitive && sensitiveHints[field.key!]"
                            class="sensitive-hint"
                          >
                            已配置 · {{ sensitiveHints[field.key!] }}
                          </span>
                          <span v-if="fieldSideEffect(field)" class="side-effect-hint">
                            {{ fieldSideEffect(field) }}
                          </span>
                        </div>
                      </template>

                      <a-switch
                        v-if="field.valueType === 'bool'"
                        v-model:checked="formState[field.key!] as boolean"
                      />
                      <a-input-number
                        v-else-if="field.valueType === 'int' || field.valueType === 'long' || field.valueType === 'double'"
                        v-model:value="formState[field.key!] as number"
                        style="width: 100%"
                        :min="field.min"
                        :max="field.max"
                      />
                      <a-select
                        v-else-if="field.enumValues?.length"
                        v-model:value="formState[field.key!] as string"
                        style="width: 100%"
                        :options="(field.enumValues || []).map((v: string) => ({ label: v, value: v }))"
                      />
                      <a-input-password
                        v-else-if="field.sensitive"
                        v-model:value="formState[field.key!] as string"
                        placeholder="不修改请留空"
                        autocomplete="new-password"
                      />
                      <a-textarea
                        v-else-if="isTextAreaField(field)"
                        v-model:value="formState[field.key!] as string"
                        :rows="isTextAreaField(field) && (field.key || '').includes('prompt') ? 5 : 3"
                        :placeholder="String(field.defaultValue ?? '')"
                      />
                      <a-input
                        v-else
                        v-model:value="formState[field.key!] as string"
                        :placeholder="String(field.defaultValue ?? '')"
                      />
                    </a-form-item>
                  </a-form>
                </div>

                <a-collapse
                  v-if="collapsibleGroups.length"
                  v-model:activeKey="advancedOpenKeys"
                  ghost
                  class="settings-advanced"
                >
                  <a-collapse-panel
                    v-for="group in collapsibleGroups"
                    :key="group.key"
                    :header="group.title"
                  >
                    <a-form layout="vertical" class="settings-form">
                      <a-form-item
                        v-for="field in fieldsOfGroup(group)"
                        :key="field.key"
                        :label="field.label || field.key"
                      >
                        <template #extra>
                          <div class="field-extra">
                            <span v-if="field.description">{{ field.description }}</span>
                            <a-tag
                              v-if="fieldSource(field.key!) === 'db'"
                              color="orange"
                              class="source-tag"
                            >
                              已自定义
                            </a-tag>
                          </div>
                        </template>
                        <a-switch
                          v-if="field.valueType === 'bool'"
                          v-model:checked="formState[field.key!] as boolean"
                        />
                        <a-input-number
                          v-else-if="field.valueType === 'int' || field.valueType === 'long' || field.valueType === 'double'"
                          v-model:value="formState[field.key!] as number"
                          style="width: 100%"
                          :min="field.min"
                          :max="field.max"
                        />
                        <a-select
                          v-else-if="field.enumValues?.length"
                          v-model:value="formState[field.key!] as string"
                          style="width: 100%"
                          :options="(field.enumValues || []).map((v: string) => ({ label: v, value: v }))"
                        />
                        <a-input
                          v-else
                          v-model:value="formState[field.key!] as string"
                          :placeholder="String(field.defaultValue ?? '')"
                        />
                      </a-form-item>
                    </a-form>
                  </a-collapse-panel>
                </a-collapse>

                <a-form
                  v-if="ungroupedFields.length"
                  layout="vertical"
                  class="settings-form"
                >
                  <a-form-item
                    v-for="field in ungroupedFields"
                    :key="field.key"
                    :label="field.label || field.key"
                  >
                    <a-input v-model:value="formState[field.key!] as string" />
                  </a-form-item>
                </a-form>
              </template>

              <!-- 普通模块表单（site / security / upload） -->
              <a-form v-else layout="vertical" class="settings-form">
                <a-form-item
                  v-for="field in fields"
                  :key="field.key"
                  :label="field.label || field.key"
                >
                  <template #extra>
                    <div class="field-extra">
                      <span v-if="field.description">{{ field.description }}</span>
                      <a-tag
                        v-if="fieldSource(field.key!) === 'db'"
                        color="orange"
                        class="source-tag"
                      >
                        已自定义
                      </a-tag>
                      <a-tag v-if="field.danger" color="red" class="source-tag">高风险</a-tag>
                    </div>
                  </template>

                  <a-switch
                    v-if="field.valueType === 'bool'"
                    v-model:checked="formState[field.key!] as boolean"
                  />
                  <a-input-number
                    v-else-if="field.valueType === 'int' || field.valueType === 'long' || field.valueType === 'double'"
                    v-model:value="formState[field.key!] as number"
                    style="width: 100%"
                    :min="field.min"
                    :max="field.max"
                  />
                  <a-select
                    v-else-if="field.enumValues?.length"
                    v-model:value="formState[field.key!] as string"
                    style="width: 100%"
                    :options="(field.enumValues || []).map((v: string) => ({ label: v, value: v }))"
                  />
                  <a-input-password
                    v-else-if="field.sensitive"
                    v-model:value="formState[field.key!] as string"
                    placeholder="不修改请留空"
                    autocomplete="new-password"
                  />
                  <a-textarea
                    v-else-if="isTextAreaField(field)"
                    v-model:value="formState[field.key!] as string"
                    :rows="3"
                    :placeholder="String(field.defaultValue ?? '')"
                  />
                  <a-input
                    v-else
                    v-model:value="formState[field.key!] as string"
                    :placeholder="String(field.defaultValue ?? '')"
                  />
                </a-form-item>
              </a-form>

              <div v-if="isWritable" class="admin-action-bar">
                <a-button type="primary" :loading="saving" @click="doSave">保存</a-button>
                <a-button danger :disabled="saving" @click="doReset">恢复默认</a-button>
              </div>
            </a-spin>
          </a-card>
        </section>
      </div>
    </a-spin>
  </div>
  </StationRoomShell>
</template>

<style scoped>
.site-settings-page {
  max-width: 1280px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  align-items: start;
}

.settings-main {
  min-width: 0;
}

.module-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.02);
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.group-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.settings-advanced {
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.02);
}

.settings-advanced :deep(.ant-collapse-header) {
  color: var(--color-text-secondary) !important;
}

.settings-form {
  margin-bottom: 0 !important;
}

/* 表单可读宽度：输入控件不再横贯 1920 舞台 */
.settings-form :deep(.ant-form-item) {
  max-width: 720px;
}
.settings-form :deep(.ant-form-item-control-input-content) {
  max-width: 100%;
}

.field-extra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
}

.source-tag {
  margin-inline-end: 0;
}

.sensitive-hint,
.side-effect-hint {
  color: var(--color-text-muted);
  font-size: 12px;
}

.side-effect-hint {
  width: 100%;
  color: #d48806;
}

@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
}
</style>
