<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { THEME } from '@/shared/ui/colors'
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  getStageConfigs,
  updateStageConfigs,
  probeModels,
  autoConfigureStages,
} from '@/features/admin/api/providers'

// ── Provider 列表 ──────────────────────────────────
const loading = ref(false)
const providers = ref([])
const error = ref('')

const typeColorMap = {
  openai_compatible: THEME.primary,
  anthropic: THEME.purple,
  google: THEME.orange,
}

const typeLabelMap = {
  openai_compatible: 'OpenAI 兼容',
  anthropic: 'Anthropic',
  google: 'Google',
}

// 类型对应的默认 URL 占位
const basePlaceholders = {
  openai_compatible: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com',
}

// 类型对应的推荐模型
const modelSuggestions = {
  openai_compatible: 'qwen/qwen3-235b-a22b',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
}

async function loadProviders() {
  loading.value = true
  try {
    const res = await listProviders()
    providers.value = res?.data ?? res ?? []
    error.value = ''
  } catch (e) {
    error.value = e.message || '加载 Provider 列表失败'
  } finally {
    loading.value = false
  }
}

// ── 连通性测试 ──────────────────────────────────────
const testingId = ref('')

async function handleTest(row) {
  testingId.value = row.id
  try {
    const res = await testProvider(row.id)
    const data = res?.data ?? res
    if (data?.healthy) {
      showMsg('success', `连通性正常${data.detail ? ' — ' + data.detail : ''}`)
    } else {
      showMsg('error', `连通失败: ${data?.detail || '未知错误'}`)
    }
    await loadProviders()
  } catch (e) {
    showMsg('error', e.message || '测试失败')
  } finally {
    testingId.value = ''
  }
}

// ── 删除 ─────────────────────────────────────────────
const deleteConfirmVisible = ref(false)
const deleteTarget = ref(null)

function confirmDelete(row) {
  deleteTarget.value = row
  deleteConfirmVisible.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return
  try {
    await deleteProvider(deleteTarget.value.id)
    showMsg('success', '已删除')
    deleteConfirmVisible.value = false
    deleteTarget.value = null
    await loadProviders()
    await loadStageConfigs()
  } catch (e) {
    showMsg('error', e.message || '删除失败')
  }
}

// ── 新增 / 编辑对话框 ───────────────────────────────
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref('')
const saving = ref(false)
const form = reactive({
  name: '',
  api_format: 'openai_compatible',
  api_key: '',
  base_url: '',
  models_json: '',
  priority: 50,
  is_active: true,
})

function openAdd() {
  isEdit.value = false
  editId.value = ''
  Object.assign(form, {
    name: '',
    api_format: 'openai_compatible',
    api_key: '',
    base_url: '',
    models_json: '',
    priority: 50,
    is_active: true,
  })
  probedModels.value = []
  selectedModels.value = []
  decisionModel.value = ''
  probeError.value = ''
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, {
    name: row.name,
    api_format: row.api_format,
    api_key: '', // 不回填密钥
    base_url: row.base_url,
    models_json: (row.models_json || []).join(', '),
    priority: row.priority ?? 0,
    is_active: row.is_active !== false,
  })
  probedModels.value = row.models_json || []
  selectedModels.value = [...(row.models_json || [])]
  decisionModel.value = (row.models_json || [])[0] || ''
  probeError.value = ''
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  probedModels.value = []
  selectedModels.value = []
  decisionModel.value = ''
}

async function handleSave() {
  if (!form.name.trim()) return showMsg('error', '名称不能为空')
  if (!form.base_url.trim()) return showMsg('error', '基础URL不能为空')

  saving.value = true
  let savedProvider = null
  try {
    const payload = {
      name: form.name.trim(),
      api_format: form.api_format,
      base_url: form.base_url.trim(),
      priority: form.priority,
      is_active: form.is_active,
      models_json: form.models_json
        ? form.models_json.split(',').map(s => s.trim()).filter(Boolean)
        : null,
    }

    if (isEdit.value) {
      if (form.api_key) payload.api_key = form.api_key
      const res = await updateProvider(editId.value, payload)
      savedProvider = res?.data ?? res
      showMsg('success', '更新成功')
    } else {
      if (form.api_key) payload.api_key = form.api_key
      const res = await createProvider(payload)
      savedProvider = res?.data ?? res
      showMsg('success', '创建成功')
    }
    const chosenDecision = decisionModel.value
    closeDialog()
    await loadProviders()

    // 若用户选了决策模型 & provider 已有 models_json → 询问是否自动分配
    if (chosenDecision && savedProvider?.id) {
      const row = providers.value.find(p => p.id === savedProvider.id) || savedProvider
      const models = row.models_json || []
      if (models.includes(chosenDecision)) {
        askAutoConfigure(row, chosenDecision)
      }
    }
  } catch (e) {
    showMsg('error', e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ── AI 辅助：模型探测 & 自动分配 ────────────────────────
const probing = ref(false)
const probedModels = ref([])         // 探测到的全部模型
const selectedModels = ref([])       // 用户勾选要启用的模型
const decisionModel = ref('')        // 决策模型 ID
const probeError = ref('')

async function handleProbe() {
  if (!form.base_url.trim()) return showMsg('error', '请先填写基础URL')
  if (!form.api_key.trim() && !isEdit.value) return showMsg('error', '请先填写 API 密钥')
  if (isEdit.value && !form.api_key.trim()) {
    return showMsg('error', '编辑模式探测需要重新输入 API 密钥')
  }
  probing.value = true
  probeError.value = ''
  try {
    const res = await probeModels({
      base_url: form.base_url.trim(),
      api_key: form.api_key.trim(),
      api_format: form.api_format,
    })
    const data = res?.data ?? res
    probedModels.value = data.models || []
    selectedModels.value = [...probedModels.value]
    decisionModel.value = probedModels.value[0] || ''
    form.models_json = selectedModels.value.join(', ')
    showMsg('success', `探测到 ${probedModels.value.length} 个可用模型`)
  } catch (e) {
    probeError.value = e.message || '探测失败'
    showMsg('error', probeError.value)
  } finally {
    probing.value = false
  }
}

function toggleModelSelect(m) {
  const idx = selectedModels.value.indexOf(m)
  if (idx >= 0) selectedModels.value.splice(idx, 1)
  else selectedModels.value.push(m)
  form.models_json = selectedModels.value.join(', ')
  if (!selectedModels.value.includes(decisionModel.value)) {
    decisionModel.value = selectedModels.value[0] || ''
  }
}

// 保存成功后的自动分配确认
const autoConfirmVisible = ref(false)
const autoConfirmProvider = ref(null)
const autoConfirmDecisionModel = ref('')
const autoRunning = ref(false)
const autoResult = ref(null)
const autoProgress = ref(0)
const autoPhase = ref('')
const autoElapsedMs = ref(0)
let autoTimerId = null
let autoStartTs = 0

const AUTO_PHASES = [
  { at: 0,    label: '准备请求…' },
  { at: 5,    label: '连接决策模型…' },
  { at: 15,   label: '模型思考中（这可能需要 10–60 秒）…' },
  { at: 60,   label: '仍在等待模型响应…' },
  { at: 90,   label: '解析 JSON 并合并规则回退…' },
]

function tickAutoProgress() {
  const elapsed = Date.now() - autoStartTs
  autoElapsedMs.value = elapsed
  // 渐进到 90%：ease-out，前 20 秒快，之后放缓
  const t = Math.min(1, elapsed / 20000)
  const eased = 1 - Math.pow(1 - t, 2)
  autoProgress.value = Math.min(90, 5 + eased * 75 + Math.min(10, elapsed / 6000))
  // 更新阶段文案
  const secs = elapsed / 1000
  let phase = AUTO_PHASES[0].label
  for (const p of AUTO_PHASES) {
    if (secs >= p.at) phase = p.label
  }
  autoPhase.value = phase
}

function startAutoProgress() {
  autoProgress.value = 2
  autoPhase.value = AUTO_PHASES[0].label
  autoElapsedMs.value = 0
  autoStartTs = Date.now()
  if (autoTimerId) clearInterval(autoTimerId)
  autoTimerId = setInterval(tickAutoProgress, 250)
}

function finishAutoProgress() {
  if (autoTimerId) { clearInterval(autoTimerId); autoTimerId = null }
  autoProgress.value = 100
  autoPhase.value = '完成'
}

function askAutoConfigure(providerRow, decisionModelId) {
  autoConfirmProvider.value = providerRow
  autoConfirmDecisionModel.value = decisionModelId
  autoResult.value = null
  autoProgress.value = 0
  autoPhase.value = ''
  autoElapsedMs.value = 0
  autoConfirmVisible.value = true
}

async function runAutoConfigure() {
  if (!autoConfirmProvider.value || !autoConfirmDecisionModel.value) return
  autoRunning.value = true
  startAutoProgress()
  try {
    const res = await autoConfigureStages(
      autoConfirmProvider.value.id,
      autoConfirmDecisionModel.value,
    )
    const data = res?.data ?? res
    finishAutoProgress()
    autoResult.value = data
    if (data.used_rule_fallback) {
      showMsg('error', '决策模型未能返回合法结果，已全部回退到规则式分配（详见结果面板）')
    } else if ((data.rule_count ?? 0) > 0) {
      showMsg('success', `完成：LLM ${data.llm_count}/8，规则补全 ${data.rule_count}/8`)
    } else {
      showMsg('success', '决策模型已为 8/8 阶段完成分配')
    }
    await loadStageConfigs()
  } catch (e) {
    finishAutoProgress()
    autoProgress.value = 0
    showMsg('error', e.message || '自动分配失败')
  } finally {
    autoRunning.value = false
  }
}

// 独立：Stage 卡片右上角「AI 自动分配」入口
const standaloneAutoVisible = ref(false)
const standaloneAutoProvider = ref('')
const standaloneAutoModel = ref('')
const standaloneModels = computed(() => {
  const p = providers.value.find(x => x.id === standaloneAutoProvider.value)
  return (p?.models_json) || []
})
function openStandaloneAuto() {
  standaloneAutoProvider.value = activeProviders.value[0]?.id || ''
  standaloneAutoModel.value = ''
  standaloneAutoVisible.value = true
}
async function runStandaloneAuto() {
  if (!standaloneAutoProvider.value || !standaloneAutoModel.value) {
    return showMsg('error', '请选择 Provider 和决策模型')
  }
  const provider = providers.value.find(p => p.id === standaloneAutoProvider.value)
  standaloneAutoVisible.value = false
  askAutoConfigure(provider, standaloneAutoModel.value)
}


const STAGES = [
  { key: 'topic_analysis', label: '主题分析' },
  { key: 'outline_planning', label: '大纲规划' },
  { key: 'literature_review', label: '文献检索' },
  { key: 'abstract', label: '摘要生成' },
  { key: 'section_writing', label: '章节撰写' },
  { key: 'conclusion', label: '结论生成' },
  { key: 'references', label: '参考文献' },
  { key: 'review', label: '审校润色' },
]

const stageLoading = ref(false)
const stageSaving = ref(false)
const stageConfigs = ref([])
// 每个 stage 的配置：primary provider + fallback provider + model
const stageForm = reactive({})

function initStageForm() {
  STAGES.forEach(s => {
    if (!stageForm[s.key]) {
      stageForm[s.key] = { primary: '', fallback: '', model: '' }
    }
  })
}
// 立即初始化，避免模板首次渲染时访问 undefined
initStageForm()

async function loadStageConfigs() {
  stageLoading.value = true
  try {
    const res = await getStageConfigs()
    stageConfigs.value = res?.data ?? res ?? []
    // 解析到 stageForm
    initStageForm()
    STAGES.forEach(s => {
      stageForm[s.key] = { primary: '', fallback: '', model: '' }
    })
    for (const cfg of stageConfigs.value) {
      const entry = stageForm[cfg.stage]
      if (!entry) continue
      if (cfg.is_fallback) {
        entry.fallback = cfg.provider_id
      } else {
        entry.primary = cfg.provider_id
        entry.model = cfg.model || ''
      }
    }
  } catch (e) {
    showMsg('error', e.message || '加载 Stage 配置失败')
  } finally {
    stageLoading.value = false
  }
}

async function saveStageConfigs() {
  stageSaving.value = true
  try {
    const configs = []
    let priority = 0
    for (const s of STAGES) {
      const entry = stageForm[s.key]
      if (!entry?.primary) continue
      configs.push({
        stage: s.key,
        provider_id: entry.primary,
        model: entry.model || '',
        is_fallback: false,
        priority: priority++,
      })
      if (entry.fallback) {
        configs.push({
          stage: s.key,
          provider_id: entry.fallback,
          model: entry.model || '',
          is_fallback: true,
          priority: priority++,
        })
      }
    }
    await updateStageConfigs({ configs })
    showMsg('success', 'Stage 配置已保存')
    await loadStageConfigs()
  } catch (e) {
    showMsg('error', e.message || '保存 Stage 配置失败')
  } finally {
    stageSaving.value = false
  }
}

// Provider 选项列表 (仅启用)
const activeProviders = computed(() =>
  providers.value.filter(p => p.is_active)
)

// ── 消息提示 ──────────────────────────────────────────
const msgVisible = ref(false)
const msgType = ref('success')
const msgText = ref('')
let msgTimer = null

function showMsg(type, text) {
  msgType.value = type
  msgText.value = text
  msgVisible.value = true
  clearTimeout(msgTimer)
  msgTimer = setTimeout(() => { msgVisible.value = false }, 3500)
}

// ── 初始化 ────────────────────────────────────────────
onMounted(async () => {
  initStageForm()
  await loadProviders()
  await loadStageConfigs()
})
</script>

<template>
  <div class="provider-page">
    <!-- 消息条 -->
    <Transition name="msg-fade">
      <div v-if="msgVisible" class="msg-bar" :class="msgType">
        {{ msgText }}
      </div>
    </Transition>

    <!-- Section 1: Provider 列表 -->
    <div class="section-card">
      <div class="page-header">
        <h1>Provider 管理</h1>
        <div class="header-actions">
          <button class="btn-secondary" @click="loadProviders" :disabled="loading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            刷新
          </button>
          <button class="btn-primary" @click="openAdd">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            添加 Provider
          </button>
        </div>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>基础URL</th>
              <th>默认模型</th>
              <th>状态</th>
              <th>优先级</th>
              <th>健康</th>
              <th style="text-align:right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="empty-cell">加载中…</td>
            </tr>
            <tr v-else-if="providers.length === 0">
              <td colspan="8" class="empty-cell">暂无 Provider，点击右上角添加</td>
            </tr>
            <tr v-for="row in providers" :key="row.id">
              <td class="name-cell">{{ row.name }}</td>
              <td>
                <span class="tag" :style="{ color: typeColorMap[row.api_format] || '#8c8c8c', borderColor: typeColorMap[row.api_format] || '#d9d9d9' }">
                  {{ typeLabelMap[row.api_format] || row.api_format }}
                </span>
              </td>
              <td class="url-cell mono">{{ row.base_url }}</td>
              <td class="mono">{{ (row.models_json || [])[0] || '—' }}</td>
              <td>
                <span class="status-dot" :style="{ background: row.is_active ? THEME.success : '#bfbfbf' }"></span>
                {{ row.is_active ? '启用' : '禁用' }}
              </td>
              <td>{{ row.priority }}</td>
              <td>
                <span class="tag" :class="'health-' + (row.health_status || 'unknown')">
                  {{ row.health_status || 'unknown' }}
                </span>
              </td>
              <td class="actions-cell">
                <button class="btn-small" @click="openEdit(row)">编辑</button>
                <button class="btn-small" @click="handleTest(row)" :disabled="testingId === row.id">
                  {{ testingId === row.id ? '检测中…' : '检测连通性' }}
                </button>
                <button class="btn-small btn-danger" @click="confirmDelete(row)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Section 2: Stage 配置 -->
    <div class="section-card" style="margin-top: 24px">
      <div class="page-header">
        <h1>Stage 配置</h1>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="header-hint">为每个生成阶段指定主 / 备 Provider 与模型</span>
          <button class="btn-secondary btn-ai" @click="openStandaloneAuto">
            🤖 AI 自动分配
          </button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>阶段</th>
              <th>主 Provider</th>
              <th>备用 Provider</th>
              <th>模型覆盖</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in STAGES" :key="s.key">
              <td class="name-cell">{{ s.label }}</td>
              <td>
                <select v-model="stageForm[s.key].primary" class="inline-select">
                  <option value="">— 未指定 —</option>
                  <option v-for="p in activeProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </td>
              <td>
                <select v-model="stageForm[s.key].fallback" class="inline-select">
                  <option value="">— 无备用 —</option>
                  <option v-for="p in activeProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </td>
              <td>
                <input
                  type="text"
                  v-model="stageForm[s.key].model"
                  class="inline-input"
                  placeholder="留空使用 Provider 默认模型"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="stage-footer">
        <button class="btn-primary" @click="saveStageConfigs" :disabled="stageSaving">
          {{ stageSaving ? '保存中…' : '保存 Stage 配置' }}
        </button>
      </div>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <div v-if="dialogVisible" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ isEdit ? '编辑 Provider' : '添加 Provider' }}</h3>
          <button class="dialog-close" @click="closeDialog">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input type="text" v-model="form.name" placeholder="如 OpenRouter / DeepSeek" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="form.api_format">
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
          </div>
          <div class="form-group">
            <label>API 密钥 {{ isEdit ? '(留空不修改)' : '' }}</label>
            <input type="password" v-model="form.api_key" placeholder="sk-..." autocomplete="off" />
          </div>
          <div class="form-group">
            <label>基础URL <span class="required">*</span></label>
            <input type="text" v-model="form.base_url" :placeholder="basePlaceholders[form.api_format]" />
          </div>
          <div class="form-group">
            <div class="probe-header">
              <label>模型列表</label>
              <button
                type="button"
                class="btn-small btn-probe"
                @click="handleProbe"
                :disabled="probing"
              >
                {{ probing ? '探测中…' : '🔍 探测可用模型' }}
              </button>
            </div>
            <input
              type="text"
              v-model="form.models_json"
              :placeholder="modelSuggestions[form.api_format] + ' 或点击上方按钮自动探测'"
            />
            <div v-if="probedModels.length > 0" class="probed-panel">
              <div class="probed-hint">
                共 {{ probedModels.length }} 个模型。勾选要启用的，并选择一个作为 <b>决策模型</b>（用于为 8 个阶段自动分配主/备）：
              </div>
              <div class="probed-list">
                <label v-for="m in probedModels" :key="m" class="probed-item">
                  <input
                    type="checkbox"
                    :checked="selectedModels.includes(m)"
                    @change="toggleModelSelect(m)"
                  />
                  <input
                    type="radio"
                    name="decisionModel"
                    :value="m"
                    v-model="decisionModel"
                    :disabled="!selectedModels.includes(m)"
                  />
                  <span class="probed-name mono">{{ m }}</span>
                </label>
              </div>
              <div v-if="decisionModel" class="decision-hint">
                决策模型：<span class="mono">{{ decisionModel }}</span>。保存后将询问是否立刻自动分配 8 个阶段。
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>优先级</label>
              <input type="number" v-model.number="form.priority" min="0" max="100" />
            </div>
            <div class="form-group">
              <label class="switch-label">
                <input type="checkbox" v-model="form.is_active" />
                启用
              </label>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialog">取消</button>
          <button class="btn-primary" @click="handleSave" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="deleteConfirmVisible" class="dialog-overlay" @click.self="deleteConfirmVisible = false">
      <div class="dialog dialog-sm">
        <div class="dialog-header">
          <h3>确认删除</h3>
          <button class="dialog-close" @click="deleteConfirmVisible = false">✕</button>
        </div>
        <div class="dialog-body">
          <p>确定要删除 <strong>{{ deleteTarget?.name }}</strong> 吗？关联的 Stage 配置也会被清除。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="deleteConfirmVisible = false">取消</button>
          <button class="btn-primary btn-danger-fill" @click="handleDelete">删除</button>
        </div>
      </div>
    </div>

    <!-- AI 自动分配：确认 & 结果 -->
    <div v-if="autoConfirmVisible" class="dialog-overlay" @click.self="autoConfirmVisible = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>🤖 AI 自动分配 Stage 配置</h3>
          <button class="dialog-close" @click="autoConfirmVisible = false">✕</button>
        </div>
        <div class="dialog-body">
          <p v-if="!autoResult && !autoRunning">
            即将让 <b>{{ autoConfirmProvider?.name }}</b> 使用决策模型
            <span class="mono">{{ autoConfirmDecisionModel }}</span>
            为 8 个生成阶段自动选择主 / 备模型。<br/>
            该操作会 <b>覆盖当前 Provider 已有的 Stage 配置</b>。
          </p>
          <div v-if="autoRunning && !autoResult" class="auto-progress">
            <div class="auto-progress-header">
              <span class="auto-progress-phase">{{ autoPhase || '准备中…' }}</span>
              <span class="auto-progress-meta">
                {{ Math.round(autoProgress) }}% · {{ (autoElapsedMs / 1000).toFixed(1) }}s
              </span>
            </div>
            <div class="auto-progress-track">
              <div
                class="auto-progress-bar"
                :style="{ width: autoProgress + '%' }"
              >
                <div class="auto-progress-shimmer"></div>
              </div>
            </div>
            <div class="auto-progress-hint">
              决策模型正在为 8 个阶段选择模型；完整一次往返通常 10–60 秒，请勿关闭窗口。
            </div>
          </div>
          <div v-if="autoResult">
            <div
              class="auto-result-head"
              :class="autoResult.used_rule_fallback ? 'warn' : (autoResult.rule_count > 0 ? 'mix' : 'ok')"
            >
              <template v-if="autoResult.used_rule_fallback">
                ⚠️ 决策模型未能返回合法结果，已全部使用规则式分配
              </template>
              <template v-else-if="autoResult.rule_count > 0">
                ℹ️ 决策模型完成 <b>{{ autoResult.llm_count }}/8</b> 阶段，其余 {{ autoResult.rule_count }} 个由规则补全
              </template>
              <template v-else>
                ✅ 决策模型已为 8/8 阶段完成分配
              </template>
            </div>
            <table class="data-table" style="margin-top:12px">
              <thead>
                <tr><th>阶段</th><th>主模型</th><th>备用模型</th><th style="width:80px">来源</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in (autoResult.assignment || [])" :key="row.stage">
                  <td>{{ row.stage }}</td>
                  <td class="mono">{{ row.primary }}</td>
                  <td class="mono">{{ row.fallback || '—' }}</td>
                  <td>
                    <span
                      class="source-badge"
                      :class="(autoResult.per_stage_source?.[row.stage] === 'llm') ? 'src-llm' : 'src-rule'"
                    >
                      {{ autoResult.per_stage_source?.[row.stage] === 'llm' ? '🤖 LLM' : '🧩 规则' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <details
              v-if="autoResult.raw_preview || (autoResult.parse_notes && autoResult.parse_notes.length)"
              class="raw-details"
            >
              <summary>查看决策模型原始响应 / 诊断信息</summary>
              <div v-if="autoResult.parse_notes && autoResult.parse_notes.length" class="parse-notes">
                <b>解析提示：</b>
                <ul>
                  <li v-for="(n, i) in autoResult.parse_notes" :key="i">{{ n }}</li>
                </ul>
              </div>
              <pre v-if="autoResult.raw_preview" class="raw-pre">{{ autoResult.raw_preview }}</pre>
            </details>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="autoConfirmVisible = false">
            {{ autoResult ? '关闭' : '取消' }}
          </button>
          <button
            v-if="!autoResult"
            class="btn-primary"
            @click="runAutoConfigure"
            :disabled="autoRunning"
          >
            {{ autoRunning ? '分配中…' : '开始自动分配' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 独立入口：选 Provider + 决策模型 -->
    <div v-if="standaloneAutoVisible" class="dialog-overlay" @click.self="standaloneAutoVisible = false">
      <div class="dialog dialog-sm">
        <div class="dialog-header">
          <h3>🤖 AI 自动分配</h3>
          <button class="dialog-close" @click="standaloneAutoVisible = false">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Provider</label>
            <select v-model="standaloneAutoProvider">
              <option v-for="p in activeProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>决策模型</label>
            <select v-model="standaloneAutoModel" :disabled="standaloneModels.length === 0">
              <option value="">— 请选择 —</option>
              <option v-for="m in standaloneModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <div v-if="standaloneModels.length === 0" class="decision-hint" style="color:#cf1322">
              该 Provider 尚未记录模型列表。请先编辑 Provider 并「探测可用模型」。
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="standaloneAutoVisible = false">取消</button>
          <button class="btn-primary" @click="runStandaloneAuto">下一步</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.provider-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* ── 消息条 ────────────────────────────── */
.msg-bar {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.msg-bar.success { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.msg-bar.error   { background: #fff2f0; color: #cf1322; border: 1px solid #ffa39e; }
.msg-fade-enter-active, .msg-fade-leave-active { transition: opacity .3s, transform .3s; }
.msg-fade-enter-from, .msg-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* ── 通用 ──────────────────────────────── */
.section-card {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── 按钮 ──────────────────────────────── */
.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-strong);
  color: var(--btn-primary-text, #fff);
}
.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: var(--surface-strong);
  color: var(--text-main);
  border-color: var(--border-soft);
}
.btn-secondary:hover { background: var(--surface); }

.btn-small {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-small:hover { background: var(--surface); }
.btn-small:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger { color: var(--danger) !important; border-color: var(--danger-border) !important; }
.btn-danger:hover { background: var(--danger-light) !important; }

.btn-danger-fill { background: var(--danger) !important; color: #fff !important; border-color: var(--danger) !important; }
.btn-danger-fill:hover { opacity: 0.85; }

/* ── 表格 ──────────────────────────────── */
.table-wrapper { overflow-x: auto; }

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-soft);
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-main);
  vertical-align: middle;
}

.data-table tbody tr:hover { background: var(--surface-strong); }

.name-cell { font-weight: 600; white-space: nowrap; }
.url-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono { font-family: monospace; font-size: 12px; }
.empty-cell { text-align: center; color: var(--text-secondary); padding: 32px 12px !important; }

.actions-cell {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* ── Tag / Status ──────────────────────── */
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
}

.health-healthy  { color: #389e0d; border-color: #b7eb8f; background: #f6ffed; }
.health-unhealthy { color: #cf1322; border-color: #ffa39e; background: #fff2f0; }
.health-unknown  { color: #8c8c8c; border-color: #d9d9d9; background: #fafafa; }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
}

/* ── Stage 表单 ────────────────────────── */
.inline-select, .inline-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-strong);
  color: var(--text-main);
  outline: none;
}
.inline-select:focus, .inline-input:focus { border-color: var(--primary-strong); }

.stage-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* ── 对话框 ────────────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog {
  background: var(--surface-elevated);
  border-radius: 12px;
  width: 520px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
}

.dialog-sm { width: 400px; }

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-soft);
}

.dialog-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.dialog-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-soft);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.required { color: var(--danger); }

.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="password"],
.form-group select {
  padding: 8px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-strong);
  color: var(--text-main);
  outline: none;
}

.form-group input:focus,
.form-group select:focus { border-color: var(--primary-strong); }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: end;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
}

.error-bar {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}

/* ── 探测模型 / AI 自动分配 ──────────────────────── */
.probe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.btn-probe, .btn-ai {
  background: #eef5ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn-probe:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ai { padding: 6px 14px; font-size: 13px; }
.probed-panel {
  margin-top: 10px;
  padding: 10px 12px;
  background: #fafbff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.probed-hint { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.probed-list { display: grid; grid-template-columns: 1fr; gap: 4px; }
.probed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.probed-item:hover { background: #f3f4f6; }
.probed-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.decision-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #1d4ed8;
  padding: 6px 8px;
  background: #eef5ff;
  border-radius: 6px;
}
.auto-result-head {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}
.auto-result-head.ok   { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.auto-result-head.warn { background: #fffbe6; color: #ad6800; border: 1px solid #ffe58f; }
.auto-result-head.mix  { background: #e6f4ff; color: #0958d9; border: 1px solid #91caff; }

.source-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.source-badge.src-llm  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.source-badge.src-rule { background: #fef3c7; color: #a16207; border: 1px solid #fde68a; }

.auto-progress {
  padding: 6px 2px 4px;
}
.auto-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  font-size: 13px;
}
.auto-progress-phase { color: #1f2937; font-weight: 500; }
.auto-progress-meta { color: #6b7280; font-variant-numeric: tabular-nums; font-size: 12px; }
.auto-progress-track {
  height: 10px;
  border-radius: 999px;
  background: #eef2ff;
  overflow: hidden;
  border: 1px solid #e0e7ff;
}
.auto-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  transition: width 240ms ease-out;
  position: relative;
  overflow: hidden;
}
.auto-progress-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%);
  animation: autoShimmer 1.4s linear infinite;
}
@keyframes autoShimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.auto-progress-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.raw-details {
  margin-top: 14px;
  padding: 8px 10px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
}
.raw-details summary {
  cursor: pointer;
  color: #4b5563;
  user-select: none;
}
.raw-details .parse-notes { margin: 8px 0; color: #a16207; }
.raw-details .parse-notes ul { margin: 4px 0 0 18px; padding: 0; }
.raw-pre {
  max-height: 280px;
  overflow: auto;
  background: #1f2937;
  color: #e5e7eb;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
