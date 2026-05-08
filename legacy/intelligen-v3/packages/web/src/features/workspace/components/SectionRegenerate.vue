<script setup>
import { ref } from 'vue';

const props = defineProps({
  sectionIndex: { type: Number, required: true },
  sectionTitle: { type: String, default: '' },
  taskId: { type: String, required: true },
  content: { type: String, default: '' },
});

const emit = defineEmits(['regenerated']);

const loading = ref(false);
const showDiff = ref(false);
const oldContent = ref('');
const newContent = ref('');
const error = ref('');

async function handleRegenerate() {
  loading.value = true;
  error.value = '';
  oldContent.value = props.content;

  try {
    const { regenerateSection } = await import('@/features/workspace/api/task');
    const res = await regenerateSection(props.taskId, props.sectionIndex, {
      section_title: props.sectionTitle,
    });

    if (res?.data?.code === 200 && res.data.data?.content) {
      newContent.value = res.data.data.content;
      showDiff.value = true;
      emit('regenerated', {
        sectionIndex: props.sectionIndex,
        newContent: newContent.value,
      });
    } else {
      error.value = res?.data?.message || '重新生成失败';
    }
  } catch (e) {
    error.value = e.message || '重新生成请求失败';
  } finally {
    loading.value = false;
  }
}

function closeDiff() {
  showDiff.value = false;
}
</script>

<template>
  <div class="section-regen">
    <div class="regen-toolbar">
      <button
        class="regen-btn"
        @click="handleRegenerate"
        :disabled="loading"
        title="重新生成此章节"
      >
        <span v-if="loading" class="spinner"></span>
        <span v-else>🔄</span>
        {{ loading ? '重新生成中...' : '重新生成' }}
      </button>
    </div>

    <div v-if="error" class="regen-error">
      ⚠️ {{ error }}
    </div>

    <div v-if="showDiff" class="diff-panel">
      <div class="diff-header">
        <span class="diff-title">📝 内容对比</span>
        <button class="diff-close" @click="closeDiff">✕</button>
      </div>
      <div class="diff-body">
        <div class="diff-column">
          <div class="diff-column-header old">旧版本</div>
          <div class="diff-content old">{{ oldContent.slice(0, 500) }}...</div>
        </div>
        <div class="diff-column">
          <div class="diff-column-header new">新版本</div>
          <div class="diff-content new">{{ newContent.slice(0, 500) }}...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-regen {
  margin-top: 8px;
}

.regen-toolbar {
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.2s;
}

.section-regen:hover .regen-toolbar {
  opacity: 1;
}

.regen-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #888);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.regen-btn:hover:not(:disabled) {
  background: rgba(0, 112, 243, 0.1);
  border-color: rgba(0, 112, 243, 0.3);
  color: var(--text-primary, #f0f0f0);
}

.regen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--primary, #0070F3);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.regen-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  color: #f87171;
  font-size: 12px;
}

.diff-panel {
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow: hidden;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.diff-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #f0f0f0);
}

.diff-close {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.diff-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.diff-column {
  background: rgba(0, 0, 0, 0.15);
}

.diff-column-header {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.diff-column-header.old {
  color: #f87171;
  background: rgba(239, 68, 68, 0.05);
}

.diff-column-header.new {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.05);
}

.diff-content {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary, #aaa);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
