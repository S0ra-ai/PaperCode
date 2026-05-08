<script setup>
import { ref, computed } from 'vue';
import { analyzeArchive } from '@/features/workspace/api/task';

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'analyzed']);

const dragOver = ref(false);
const uploading = ref(false);
const error = ref('');
const selectedFile = ref(null);
const analysis = ref(null);

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const fileSizeText = computed(() => {
  if (!selectedFile.value) return '';
  const bytes = selectedFile.value.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

function isValidZip(file) {
  return file && file.name.toLowerCase().endsWith('.zip');
}

function handleDragOver(e) {
  e.preventDefault();
  dragOver.value = true;
}

function handleDragLeave() {
  dragOver.value = false;
}

function handleDrop(e) {
  e.preventDefault();
  dragOver.value = false;
  const files = Array.from(e.dataTransfer?.files || []);
  const zipFile = files.find(f => isValidZip(f));
  if (zipFile) {
    selectFile(zipFile);
  } else {
    error.value = '请上传 .zip 格式的文件';
  }
}

function handleFileInput(e) {
  const file = e.target.files?.[0];
  if (file) {
    selectFile(file);
  }
  e.target.value = '';
}

function selectFile(file) {
  error.value = '';
  analysis.value = null;
  if (!isValidZip(file)) {
    error.value = '仅支持 .zip 格式文件';
    return;
  }
  if (file.size > MAX_SIZE) {
    error.value = '文件大小不能超过 50MB';
    return;
  }
  selectedFile.value = file;
}

async function handleUpload() {
  if (!selectedFile.value || uploading.value) return;
  uploading.value = true;
  error.value = '';
  try {
    const resp = await analyzeArchive(selectedFile.value);
    analysis.value = resp.data;
  } catch (e) {
    error.value = e?.message || '分析失败，请稍后重试';
  } finally {
    uploading.value = false;
  }
}

function handleConfirm() {
  if (analysis.value) {
    emit('analyzed', analysis.value);
  }
  handleClose();
}

function handleClose() {
  selectedFile.value = null;
  analysis.value = null;
  error.value = '';
  uploading.value = false;
  dragOver.value = false;
  emit('close');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat) {
  const labels = { code: '代码', doc: '文档', data: '数据', other: '其他' };
  return labels[cat] || cat;
}

function categoryColor(cat) {
  const colors = { code: '#409eff', doc: '#67c23a', data: '#e6a23c', other: '#909399' };
  return colors[cat] || '#909399';
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="archive-overlay" @click.self="handleClose" @keydown.escape="handleClose">
      <div class="archive-dialog">
        <div class="archive-header">
          <h3>📦 上传项目资料</h3>
          <button class="close-btn" @click="handleClose">&times;</button>
        </div>

        <!-- Upload zone (before analysis) -->
        <div v-if="!analysis" class="archive-body">
          <div
            class="drop-zone"
            :class="{ 'drag-over': dragOver, 'has-file': selectedFile }"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <template v-if="!selectedFile">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="drop-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p class="drop-title">拖拽 ZIP 文件到此处</p>
              <p class="drop-hint">或点击下方按钮选择文件（最大 50MB）</p>
              <label class="upload-select-btn">
                <span>选择文件</span>
                <input type="file" accept=".zip" class="hidden-input" @change="handleFileInput" />
              </label>
            </template>
            <template v-else>
              <div class="selected-file-info">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div>
                  <p class="file-name">{{ selectedFile.name }}</p>
                  <p class="file-size">{{ fileSizeText }}</p>
                </div>
                <button class="btn-clear" @click.stop="selectedFile = null; error = ''">✕</button>
              </div>
            </template>
          </div>

          <p v-if="error" class="error-text">{{ error }}</p>

          <div class="archive-actions">
            <button class="btn btn-ghost" @click="handleClose">取消</button>
            <button class="btn btn-accent" :disabled="!selectedFile || uploading" @click="handleUpload">
              {{ uploading ? '分析中...' : '开始分析' }}
            </button>
          </div>
        </div>

        <!-- Analysis results -->
        <div v-else class="archive-body archive-results">
          <div class="result-summary">
            <div class="summary-item">
              <span class="summary-label">项目类型</span>
              <span class="summary-value type-badge">{{ analysis.project_type }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">文件总数</span>
              <span class="summary-value">{{ analysis.total_files }}</span>
            </div>
            <div v-for="(count, cat) in analysis.file_counts" :key="cat" class="summary-item">
              <span class="summary-label">{{ categoryLabel(cat) }}</span>
              <span class="summary-value" :style="{ color: categoryColor(cat) }">{{ count }}</span>
            </div>
          </div>

          <div v-if="analysis.suggested_topics?.length" class="result-section">
            <h4>💡 建议论文方向</h4>
            <ul class="topic-list">
              <li v-for="(topic, i) in analysis.suggested_topics" :key="i">{{ topic }}</li>
            </ul>
          </div>

          <div v-if="analysis.file_tree?.length" class="result-section">
            <h4>📁 文件结构 <span class="count-hint">({{ Math.min(analysis.file_tree.length, 30) }} / {{ analysis.total_files }})</span></h4>
            <div class="file-tree">
              <div v-for="(entry, i) in analysis.file_tree.slice(0, 30)" :key="i" class="tree-item">
                <span class="tree-cat" :style="{ color: categoryColor(entry.category) }">●</span>
                <span class="tree-path">{{ entry.path }}</span>
                <span class="tree-size">{{ formatSize(entry.size) }}</span>
              </div>
            </div>
          </div>

          <div v-if="analysis.readme_content" class="result-section">
            <h4>📖 README 摘要</h4>
            <pre class="readme-preview">{{ analysis.readme_content.slice(0, 500) }}</pre>
          </div>

          <div class="archive-actions">
            <button class="btn btn-ghost" @click="analysis = null">重新上传</button>
            <button class="btn btn-accent" @click="handleConfirm">确认使用</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.archive-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.archive-dialog {
  background: var(--surface, #fff);
  border-radius: 16px;
  width: 560px;
  max-width: 92vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.archive-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--border-soft, #eee);
}

.archive-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main, #333);
}

.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--text-muted, #999);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-main, #333);
}

.archive-body {
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.drop-zone {
  border: 2px dashed var(--border-soft, #ddd);
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--primary, #409eff);
  background: rgba(64, 158, 255, 0.04);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: var(--primary, #409eff);
  padding: 20px 24px;
}

.drop-icon {
  color: var(--text-muted, #bbb);
  margin-bottom: 8px;
}

.drop-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main, #333);
  margin: 0 0 4px;
}

.drop-hint {
  font-size: 12px;
  color: var(--text-muted, #999);
  margin: 0 0 16px;
}

.upload-select-btn {
  display: inline-block;
  padding: 8px 20px;
  border-radius: 8px;
  background: var(--primary, #409eff);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.upload-select-btn:hover {
  opacity: 0.9;
}

.hidden-input {
  display: none;
}

.selected-file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-file-info svg {
  color: var(--primary, #409eff);
  flex-shrink: 0;
}

.file-name {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #333);
  word-break: break-all;
}

.file-size {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted, #999);
}

.btn-clear {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, #999);
  cursor: pointer;
  padding: 4px 8px;
}

.btn-clear:hover {
  color: var(--danger, #f56c6c);
}

.error-text {
  color: var(--danger, #f56c6c);
  font-size: 13px;
  margin: 12px 0 0;
}

.archive-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-ghost {
  background: var(--surface-alt, #f5f5f5);
  color: var(--text-secondary, #666);
}

.btn-ghost:hover {
  background: var(--border-soft, #e5e5e5);
}

.btn-accent {
  background: var(--primary, #409eff);
  color: #fff;
}

.btn-accent:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-accent:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Results */
.archive-results {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 16px;
  background: var(--surface-alt, #f9f9f9);
  border-radius: 10px;
  min-width: 80px;
}

.summary-label {
  font-size: 11px;
  color: var(--text-muted, #999);
  margin-bottom: 2px;
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main, #333);
}

.type-badge {
  color: var(--primary, #409eff);
}

.result-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main, #333);
  margin: 0 0 8px;
}

.count-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted, #999);
}

.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topic-list li {
  padding: 8px 12px;
  background: var(--surface-alt, #f5f7fa);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-main, #333);
  border-left: 3px solid var(--primary, #409eff);
}

.file-tree {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-soft, #eee);
  border-radius: 8px;
  padding: 8px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  font-size: 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
}

.tree-cat {
  font-size: 8px;
  flex-shrink: 0;
}

.tree-path {
  color: var(--text-secondary, #555);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-size {
  color: var(--text-muted, #999);
  font-size: 11px;
  flex-shrink: 0;
}

.readme-preview {
  background: var(--surface-alt, #f5f7fa);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, #555);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
  margin: 0;
}
</style>
