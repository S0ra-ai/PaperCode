<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['upload']);

const dragOver = ref(false);

const acceptedExtensions = [
  '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
  '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.zip',
];

const languageIcons = {
  '.py': { label: 'Python', color: '#3776AB' },
  '.java': { label: 'Java', color: '#ED8B00' },
  '.js': { label: 'JavaScript', color: '#F7DF1E' },
  '.ts': { label: 'TypeScript', color: '#3178C6' },
  '.tsx': { label: 'TypeScript', color: '#3178C6' },
  '.jsx': { label: 'JavaScript', color: '#F7DF1E' },
  '.c': { label: 'C', color: '#A8B9CC' },
  '.cpp': { label: 'C++', color: '#00599C' },
  '.h': { label: 'C Header', color: '#A8B9CC' },
  '.hpp': { label: 'C++ Header', color: '#00599C' },
  '.go': { label: 'Go', color: '#00ADD8' },
  '.rs': { label: 'Rust', color: '#DEA584' },
  '.zip': { label: 'ZIP Archive', color: '#909399' },
};

function getFileExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isAccepted(filename) {
  return acceptedExtensions.includes(getFileExtension(filename));
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
  const valid = files.filter(f => isAccepted(f.name));
  if (valid.length > 0) {
    emit('upload', valid);
  }
}

function handleFileInput(e) {
  const files = Array.from(e.target.files || []);
  if (files.length > 0) {
    emit('upload', files);
  }
  e.target.value = '';
}
</script>

<template>
  <div
    class="code-upload"
    :class="{ 'drag-over': dragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="upload-content">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
        <polyline points="16 16 12 12 8 16"></polyline>
        <line x1="12" y1="12" x2="12" y2="21"></line>
        <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"></path>
      </svg>
      <p class="upload-title">上传代码文件或 ZIP 项目</p>
      <p class="upload-hint">
        支持 Python, Java, JavaScript, TypeScript, C/C++, Go, Rust 等
      </p>
      <div class="language-chips">
        <span v-for="(info, ext) in languageIcons" :key="ext" class="lang-chip" :style="{ borderColor: info.color }">
          {{ info.label }}
        </span>
      </div>
      <label class="upload-btn" :class="{ disabled: loading }">
        <span>{{ loading ? '上传中...' : '选择文件' }}</span>
        <input
          type="file"
          :accept="acceptedExtensions.join(',')"
          multiple
          :disabled="loading"
          class="hidden-input"
          @change="handleFileInput"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.code-upload {
  border: 2px dashed var(--border-soft);
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
}
.code-upload:hover,
.code-upload.drag-over {
  border-color: var(--primary);
  background: rgba(var(--primary-rgb, 64, 158, 255), 0.04);
}
.upload-content { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.upload-icon { color: var(--text-muted); margin-bottom: 4px; }
.upload-title { font-size: 14px; font-weight: 600; color: var(--text-main); margin: 0; }
.upload-hint { font-size: 12px; color: var(--text-muted); margin: 0; }
.language-chips {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 6px; margin: 8px 0;
}
.lang-chip {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  border: 1px solid; color: var(--text-secondary); background: var(--surface);
}
.upload-btn {
  display: inline-block; padding: 8px 20px; border-radius: 8px;
  background: var(--primary); color: #fff; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: opacity 0.2s; margin-top: 4px;
}
.upload-btn:hover:not(.disabled) { opacity: 0.9; }
.upload-btn.disabled { opacity: 0.5; cursor: not-allowed; }
.hidden-input { display: none; }
</style>
