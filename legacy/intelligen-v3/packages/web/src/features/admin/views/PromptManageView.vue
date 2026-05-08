<script setup>
import { ref, onMounted, computed } from 'vue'
import { listPrompts, getPrompt, updatePrompt, previewPrompt } from '@/features/admin/api/prompts'

// 阶段中文名称映射
const stageLabelMap = {
  clarification: '需求澄清',
  clarify_agent: '澄清代理',
  planning: '大纲规划',
  writing: '章节撰写',
  content_verify: '内容审校',
  code_analysis: '代码分析',
  code_outline: '代码大纲',
  template_parsing: '模板解析',
}

// 阶段图标 (SVG path)
const stageIconMap = {
  clarification: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clarify_agent: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  planning: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  writing: 'M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  content_verify: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  code_analysis: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  code_outline: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  template_parsing: 'M4 4h16v16H4zM4 9h16M9 4v16',
}

const loading = ref(false)
const saving = ref(false)
const stages = ref([])
const activeStage = ref('')
const editorContent = ref('')
const originalContent = ref('')
const error = ref('')

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewResult = ref(null)
const previewVarsStr = ref('{}')

const hasChanges = computed(() => editorContent.value !== originalContent.value)

function stageLabel(stage) {
  return stageLabelMap[stage] || stage
}

function stageIcon(stage) {
  return stageIconMap[stage] || 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'
}

async function loadStages() {
  loading.value = true
  error.value = ''
  try {
    const res = await listPrompts()
    const data = res?.data ?? res
    stages.value = data?.stages ?? []
    if (stages.value.length && !activeStage.value) {
      await selectStage(stages.value[0].stage)
    }
  } catch (e) {
    error.value = e.message || '加载提示词列表失败'
  } finally {
    loading.value = false
  }
}

async function selectStage(stage) {
  if (hasChanges.value) {
    try {
      await ElMessageBox.confirm('当前修改尚未保存，切换将丢失更改。是否继续？', '提示', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  activeStage.value = stage
  loading.value = true
  error.value = ''
  try {
    const res = await getPrompt(stage)
    const data = res?.data ?? res
    editorContent.value = data?.content ?? ''
    originalContent.value = editorContent.value
    previewVisible.value = false
    previewResult.value = null
  } catch (e) {
    error.value = e.message || '加载提示词失败'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!activeStage.value || !hasChanges.value) return
  saving.value = true
  try {
    await updatePrompt(activeStage.value, { content: editorContent.value })
    originalContent.value = editorContent.value
    // 更新侧栏中对应阶段的 keys
    const res = await getPrompt(activeStage.value)
    const data = res?.data ?? res
    const idx = stages.value.findIndex(s => s.stage === activeStage.value)
    if (idx !== -1 && data?.keys) {
      stages.value[idx].keys = data.keys
    }
    ElMessage.success('提示词已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleReset() {
  editorContent.value = originalContent.value
  ElMessage.info('已重置为保存前的内容')
}

async function handlePreview() {
  if (!activeStage.value) return
  // 如果有未保存修改，先保存
  if (hasChanges.value) {
    try {
      await ElMessageBox.confirm('预览前需要先保存当前修改，是否保存？', '提示', {
        confirmButtonText: '保存并预览',
        cancelButtonText: '取消',
        type: 'info',
      })
      await handleSave()
    } catch {
      return
    }
  }
  let variables = {}
  try {
    variables = JSON.parse(previewVarsStr.value)
  } catch {
    ElMessage.warning('变量 JSON 格式无效，将使用空变量预览')
    variables = {}
  }
  previewLoading.value = true
  previewVisible.value = true
  try {
    const res = await previewPrompt(activeStage.value, { variables })
    const data = res?.data ?? res
    previewResult.value = data?.rendered ?? {}
  } catch (e) {
    ElMessage.error(e.message || '预览失败')
    previewResult.value = null
  } finally {
    previewLoading.value = false
  }
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
}

onMounted(() => {
  loadStages()
})
</script>

<template>
  <div class="prompt-manage-page" @keydown="handleKeydown">
    <div class="page-header">
      <h1>提示词管理</h1>
      <span class="header-hint">管理各生成阶段的提示词模板（YAML 格式，支持 Jinja2 变量）</span>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <div class="prompt-layout">
      <!-- 左侧：阶段列表 -->
      <aside class="stage-sidebar">
        <div class="sidebar-title">生成阶段</div>
        <ul class="stage-list">
          <li
            v-for="item in stages"
            :key="item.stage"
            class="stage-item"
            :class="{ active: activeStage === item.stage }"
            @click="selectStage(item.stage)"
          >
            <span class="stage-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path :d="stageIcon(item.stage)" />
              </svg>
            </span>
            <span class="stage-name">{{ stageLabel(item.stage) }}</span>
            <span class="stage-key-count">{{ item.keys?.length ?? 0 }} 键</span>
          </li>
        </ul>
      </aside>

      <!-- 右侧：编辑器 -->
      <div class="editor-area">
        <div v-if="!activeStage" class="editor-placeholder">
          <p>← 请从左侧选择一个阶段</p>
        </div>
        <template v-else>
          <div class="editor-header">
            <div class="editor-title">
              <strong>{{ stageLabel(activeStage) }}</strong>
              <code>{{ activeStage }}.yaml</code>
            </div>
            <span v-if="hasChanges" class="unsaved-badge">未保存</span>
          </div>

          <textarea
            v-model="editorContent"
            class="yaml-editor"
            spellcheck="false"
            :placeholder="`# ${activeStage}.yaml`"
          ></textarea>

          <!-- 底部工具栏 -->
          <div class="editor-toolbar">
            <div class="toolbar-left">
              <button class="btn-primary" @click="handleSave" :disabled="saving || !hasChanges">
                {{ saving ? '保存中…' : '保存' }}
              </button>
              <button class="btn-secondary" @click="handlePreview">预览</button>
              <button class="btn-secondary" @click="handleReset" :disabled="!hasChanges">重置</button>
            </div>
            <span class="toolbar-hint">Ctrl+S 快速保存</span>
          </div>

          <!-- 预览面板 -->
          <div v-if="previewVisible" class="preview-panel">
            <div class="preview-header">
              <span class="preview-title">渲染预览</span>
              <button class="preview-close" @click="previewVisible = false">✕</button>
            </div>
            <div class="preview-vars">
              <label>模板变量（JSON）</label>
              <textarea
                v-model="previewVarsStr"
                class="vars-editor"
                rows="2"
                placeholder='{"topic": "人工智能", "date_str": "2025-01-01"}'
              ></textarea>
              <button class="btn-small" @click="handlePreview" :disabled="previewLoading">
                {{ previewLoading ? '渲染中…' : '重新渲染' }}
              </button>
            </div>
            <div v-if="previewLoading" class="preview-loading">渲染中…</div>
            <div v-else-if="previewResult" class="preview-content">
              <div v-for="(value, key) in previewResult" :key="key" class="preview-item">
                <div class="preview-key">{{ key }}</div>
                <pre class="preview-value">{{ typeof value === 'string' ? value : JSON.stringify(value, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-manage-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.header-hint {
  font-size: 13px;
  color: var(--text-secondary);
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

/* 主布局：侧栏 + 编辑器 */
.prompt-layout {
  display: flex;
  gap: 20px;
  min-height: calc(100vh - 180px);
}

/* 侧栏 */
.stage-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 16px;
  align-self: flex-start;
  position: sticky;
  top: 20px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.stage-item:hover {
  background: var(--surface-strong);
  color: var(--text-main);
}

.stage-item.active {
  background: var(--primary-strong);
  color: var(--btn-primary-text, #fff);
}

.stage-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.stage-name {
  flex: 1;
  font-weight: 500;
}

.stage-key-count {
  font-size: 11px;
  opacity: 0.7;
}

/* 编辑器区域 */
.editor-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);
  font-size: 14px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text-main);
}

.editor-title code {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 4px;
}

.unsaved-badge {
  font-size: 11px;
  color: #fa8c16;
  background: #fff7e6;
  border: 1px solid #ffd591;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.yaml-editor {
  width: 100%;
  min-height: 420px;
  padding: 16px;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  resize: vertical;
  outline: none;
  tab-size: 2;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

.yaml-editor:focus {
  border-color: var(--primary-strong);
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 24, 144, 255), 0.1);
}

/* 底部工具栏 */
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.toolbar-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-primary,
.btn-secondary {
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
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-small {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  transition: all 0.2s;
}

.btn-small:hover { background: var(--surface); }
.btn-small:disabled { opacity: 0.5; cursor: not-allowed; }

/* 预览面板 */
.preview-panel {
  margin-top: 16px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.preview-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 2px;
}

.preview-vars {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-vars label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.vars-editor {
  flex: 1;
  padding: 6px 10px;
  font-family: monospace;
  font-size: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-main);
  outline: none;
  resize: none;
}

.vars-editor:focus {
  border-color: var(--primary-strong);
}

.preview-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.preview-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 500px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-key {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-strong);
  font-family: monospace;
}

.preview-value {
  margin: 0;
  padding: 12px;
  background: var(--surface-strong);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .prompt-layout {
    flex-direction: column;
  }

  .stage-sidebar {
    width: 100%;
    position: static;
  }

  .stage-list {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .stage-item {
    flex: 0 0 auto;
  }

  .preview-vars {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
