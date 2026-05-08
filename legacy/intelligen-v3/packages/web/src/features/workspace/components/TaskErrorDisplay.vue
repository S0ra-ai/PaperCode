<script setup>
import { computed } from 'vue';

const props = defineProps({
  failure: { type: Object, default: null },
  taskId: { type: String, default: '' },
});

const emit = defineEmits(['retry', 'contact-admin']);

const ERROR_STYLES = {
  quota: {
    icon: '💳',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    retryable: true,
  },
  safety: {
    icon: '🛡️',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    retryable: false,
  },
  rag: {
    icon: '📄',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.08)',
    borderColor: 'rgba(249, 115, 22, 0.2)',
    retryable: true,
  },
  engine: {
    icon: '⚙️',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.2)',
    retryable: true,
  },
  cancelled: {
    icon: '⏹️',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.08)',
    borderColor: 'rgba(107, 114, 128, 0.2)',
    retryable: false,
  },
  service: {
    icon: '🌐',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.08)',
    borderColor: 'rgba(6, 182, 212, 0.2)',
    retryable: true,
  },
  config: {
    icon: '🔧',
    color: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.08)',
    borderColor: 'rgba(234, 179, 8, 0.2)',
    retryable: false,
  },
  'file-access': {
    icon: '📁',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.08)',
    borderColor: 'rgba(249, 115, 22, 0.2)',
    retryable: false,
  },
  sync: {
    icon: '🔄',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    retryable: true,
  },
  business: {
    icon: '📋',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    retryable: false,
  },
  unknown: {
    icon: '❓',
    color: '#9ca3af',
    bgColor: 'rgba(156, 163, 175, 0.08)',
    borderColor: 'rgba(156, 163, 175, 0.2)',
    retryable: true,
  },
};

const errorStyle = computed(() => {
  const kind = props.failure?.kind || 'unknown';
  return ERROR_STYLES[kind] || ERROR_STYLES.unknown;
});

const isRetryable = computed(() => {
  return errorStyle.value.retryable;
});

const isQuotaIssue = computed(() => {
  return props.failure?.kind === 'quota';
});
</script>

<template>
  <div
    v-if="failure"
    class="error-display"
    :style="{
      background: errorStyle.bgColor,
      borderColor: errorStyle.borderColor,
    }"
  >
    <div class="error-header">
      <span class="error-icon">{{ errorStyle.icon }}</span>
      <div class="error-header-text">
        <span class="error-badge" :style="{ color: errorStyle.color }">
          {{ failure.badge }}
        </span>
        <h4 class="error-title">{{ failure.title }}</h4>
      </div>
    </div>

    <p class="error-summary">{{ failure.summary }}</p>

    <ul v-if="failure.actions?.length" class="error-actions-list">
      <li v-for="(action, idx) in failure.actions" :key="idx">{{ action }}</li>
    </ul>

    <details v-if="failure.rawMessage" class="error-raw">
      <summary>查看原始错误</summary>
      <pre class="raw-message">{{ failure.rawMessage }}</pre>
    </details>

    <div class="error-buttons">
      <button
        v-if="isRetryable"
        class="retry-btn"
        @click="$emit('retry', taskId)"
      >
        🔄 重试
      </button>
      <button
        v-if="isQuotaIssue"
        class="contact-btn"
        @click="$emit('contact-admin')"
      >
        📧 联系管理员
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-display {
  border: 1px solid;
  border-radius: var(--radius-lg, 12px);
  padding: 16px;
  margin-top: 12px;
}

.error-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.error-icon {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-header-text {
  flex: 1;
}

.error-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #f0f0f0);
  margin: 2px 0 0 0;
}

.error-summary {
  font-size: 13px;
  color: var(--text-secondary, #aaa);
  line-height: 1.6;
  margin: 0 0 10px 0;
}

.error-actions-list {
  margin: 0 0 12px 0;
  padding-left: 20px;
}

.error-actions-list li {
  font-size: 12px;
  color: var(--text-secondary, #999);
  line-height: 1.8;
}

.error-raw {
  margin-bottom: 12px;
}

.error-raw summary {
  font-size: 12px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  user-select: none;
}

.raw-message {
  margin-top: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-secondary, #888);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.error-buttons {
  display: flex;
  gap: 8px;
}

.retry-btn {
  background: rgba(0, 112, 243, 0.1);
  border: 1px solid rgba(0, 112, 243, 0.25);
  color: var(--primary, #0070F3);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: rgba(0, 112, 243, 0.2);
}

.contact-btn {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #f59e0b;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.contact-btn:hover {
  background: rgba(245, 158, 11, 0.2);
}
</style>
