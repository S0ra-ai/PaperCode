<script setup>
import { ref, onMounted, computed } from 'vue'
import { THEME } from '@/shared/ui/colors'

import { getModels, updateModelConfig } from '@/features/admin/api/dashboard'

const loading = ref(true)
const models = ref([])
const error = ref('')
const saving = ref(false)

// Edit dialog state
const editVisible = ref(false)
const editModel = ref(null)
const editForm = ref({
  name: '',
  provider: '',
  model_id: '',
  model_type: '',
  is_active: true,
  rpm_limit: 60,
  tpm_limit: 100000,
  config_json: {},
})

const modelTypeLabels = {
  writing: '写作/规划/审核',
  fast: '快速/摘要/澄清',
  code: '代码分析',
  search: '学术搜索',
  embedding: '向量嵌入',
}

function typeLabel(type) {
  return modelTypeLabels[type] || type
}

function providerColor(p) {
  if (p === 'openrouter') return THEME.primary
  if (p === 'local') return THEME.success
  return THEME.muted
}

async function loadModels() {
  loading.value = true
  try {
    const res = await getModels()
    models.value = res?.data ?? res ?? []
    error.value = ''
  } catch (e) {
    error.value = e.message || '加载模型列表失败'
  } finally {
    loading.value = false
  }
}

function openEdit(model) {
  editModel.value = model
  editForm.value = {
    name: model.name || '',
    provider: model.provider || 'openrouter',
    model_id: model.model_id || '',
    model_type: model.model_type || '',
    is_active: model.is_active !== false,
    rpm_limit: model.rpm_limit || 60,
    tpm_limit: model.tpm_limit || 100000,
    config_json: model.config_json || {},
  }
  editVisible.value = true
}

function closeEdit() {
  editVisible.value = false
  editModel.value = null
}

async function saveEdit() {
  if (!editModel.value) return
  saving.value = true
  try {
    await updateModelConfig(editModel.value.id, editForm.value)
    closeEdit()
    await loadModels()
  } catch (e) {
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

// Config JSON as editable string
const configJsonStr = computed({
  get: () => JSON.stringify(editForm.value.config_json || {}, null, 2),
  set: (val) => {
    try {
      editForm.value.config_json = JSON.parse(val)
    } catch { /* ignore parse errors while typing */ }
  },
})

onMounted(loadModels)
</script>

<template>
  <div class="model-config-page">
      <div class="page-header">
        <h1>模型配置</h1>
        <button class="btn-secondary" @click="loadModels" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          刷新
        </button>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <div class="models-grid">
        <div v-for="model in models" :key="model.id" class="model-card">
          <div class="model-header">
            <div class="model-title-row">
              <h3>{{ model.name || model.id }}</h3>
              <span class="provider-tag" :style="{ color: providerColor(model.provider) }">
                {{ model.provider }}
              </span>
            </div>
            <span class="model-type-badge">{{ typeLabel(model.model_type) }}</span>
          </div>

          <div class="model-body">
            <div class="model-info-row">
              <span class="info-label">模型 ID</span>
              <span class="info-value mono">{{ model.model_id }}</span>
            </div>
            <div class="model-info-row">
              <span class="info-label">状态</span>
              <span class="info-value">
                <span class="status-dot" :style="{ background: model.is_active ? THEME.success : THEME.danger }"></span>
                {{ model.is_active ? '启用' : '禁用' }}
              </span>
            </div>
            <div class="model-info-row" v-if="model.rpm_limit">
              <span class="info-label">RPM 限制</span>
              <span class="info-value">{{ model.rpm_limit }}</span>
            </div>
            <div class="model-info-row" v-if="model.tpm_limit">
              <span class="info-label">TPM 限制</span>
              <span class="info-value">{{ Number(model.tpm_limit).toLocaleString() }}</span>
            </div>
          </div>

          <div class="model-actions">
            <button class="btn-small" @click="openEdit(model)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              编辑
            </button>
          </div>
        </div>
      </div>

      <!-- Edit Dialog -->
      <div v-if="editVisible" class="dialog-overlay" @click.self="closeEdit">
        <div class="dialog">
          <div class="dialog-header">
            <h3>编辑模型配置 — {{ editModel?.id }}</h3>
            <button class="dialog-close" @click="closeEdit">✕</button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label>名称</label>
              <input type="text" v-model="editForm.name" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Provider</label>
                <select v-model="editForm.provider">
                  <option value="openrouter">OpenRouter</option>
                  <option value="local">Local</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="form-group">
                <label>类型</label>
                <select v-model="editForm.model_type">
                  <option value="writing">writing</option>
                  <option value="fast">fast</option>
                  <option value="code">code</option>
                  <option value="search">search</option>
                  <option value="embedding">embedding</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>模型 ID</label>
              <input type="text" v-model="editForm.model_id" placeholder="e.g. qwen/qwen3-235b-a22b" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>RPM 限制</label>
                <input type="number" v-model.number="editForm.rpm_limit" min="0" />
              </div>
              <div class="form-group">
                <label>TPM 限制</label>
                <input type="number" v-model.number="editForm.tpm_limit" min="0" />
              </div>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" v-model="editForm.is_active" />
                启用
              </label>
            </div>
            <div class="form-group">
              <label>配置参数 (JSON)</label>
              <textarea v-model="configJsonStr" rows="5" class="mono-textarea"></textarea>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-secondary" @click="closeEdit">取消</button>
            <button class="btn-primary" @click="saveEdit" :disabled="saving">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
</template>

<style scoped>
.model-config-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: flex;
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
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.btn-small:hover { background: var(--surface); }

.error-bar {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.model-card {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.model-header {
  margin-bottom: 16px;
}

.model-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-title-row h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.provider-tag {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-type-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 4px;
}

.model-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.model-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  color: var(--text-main);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-value.mono {
  font-family: monospace;
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.model-actions {
  display: flex;
  justify-content: flex-end;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  padding: 8px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-strong);
  color: var(--text-main);
  outline: none;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: var(--primary-strong);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mono-textarea {
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
}
</style>
