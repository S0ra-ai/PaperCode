<script setup>
import { computed } from 'vue';

const props = defineProps({
  message: { type: Object, required: true },
});

const emit = defineEmits(['confirm', 'modify']);

// 从 history 提取问答对
const qaList = computed(() => {
  return (props.message.history || []).filter(qa => qa.question && qa.answer);
});

// 从 summary 提取键值对
const summaryEntries = computed(() => {
  const summary = props.message.summary || {};
  return Object.entries(summary).filter(([, v]) => v);
});
</script>

<template>
  <div class="summary-card-wrapper">
    <div class="summary-card-avatar">AI</div>
    <div class="summary-card">
      <div class="summary-header">
        <span class="summary-icon">📋</span>
        <span class="summary-title">需求摘要</span>
      </div>

      <!-- 需求描述 -->
      <div v-if="message.requirement" class="summary-section">
        <p class="summary-requirement">{{ message.requirement }}</p>
      </div>

      <!-- 结构化摘要 -->
      <div v-if="summaryEntries.length" class="summary-section">
        <div v-for="[key, value] in summaryEntries" :key="key" class="summary-kv">
          <span class="summary-key">{{ key }}</span>
          <span class="summary-value">{{ value }}</span>
        </div>
      </div>

      <!-- 问答回顾 -->
      <div v-if="qaList.length" class="summary-qa-section">
        <div v-for="(qa, i) in qaList" :key="i" class="summary-qa">
          <span class="qa-q">{{ qa.question }}</span>
          <span class="qa-a">{{ qa.answer }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="summary-actions">
        <button class="summary-btn btn-modify" @click="emit('modify')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          修改需求
        </button>
        <button class="summary-btn btn-confirm" @click="emit('confirm')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          确认并生成
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-card-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.summary-card-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.summary-card {
  flex: 1;
  min-width: 0;
  max-width: min(760px, 88%);
  padding: 18px 20px;
  border-radius: 20px;
  background: var(--surface-strong);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.summary-icon {
  font-size: 18px;
}

.summary-title {
  font-weight: 700;
  font-size: 16px;
  color: var(--text-main);
}

.summary-section {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(99, 102, 241, 0.04);
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.summary-requirement {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.7;
}

.summary-kv {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}

.summary-kv + .summary-kv {
  border-top: 1px solid rgba(99, 102, 241, 0.08);
}

.summary-key {
  color: var(--text-muted);
  min-width: 80px;
  flex-shrink: 0;
  font-weight: 500;
}

.summary-value {
  color: var(--text-main);
}

.summary-qa-section {
  margin-bottom: 12px;
}

.summary-qa {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  font-size: 13px;
}

.summary-qa + .summary-qa {
  margin-top: 6px;
}

.qa-q {
  color: var(--text-muted);
  font-size: 12px;
}

.qa-a {
  color: var(--text-main);
  font-weight: 500;
}

.summary-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.summary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modify {
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-secondary);
}

.btn-modify:hover {
  border-color: #818cf8;
  color: var(--text-main);
}

.btn-confirm {
  border: none;
  background: #818cf8;
  color: #fff;
}

.btn-confirm:hover {
  background: #6366f1;
}
</style>
