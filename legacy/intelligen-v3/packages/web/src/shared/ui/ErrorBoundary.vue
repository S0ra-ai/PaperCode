<script setup>
import { onErrorCaptured, ref } from 'vue';

defineProps({
  fallbackMessage: { type: String, default: '渲染出错，请刷新重试' }
});

const error = ref(null);

onErrorCaptured((err) => {
  error.value = err;
  console.error('[ErrorBoundary]', err);
  return false;
});

function retry() {
  error.value = null;
}
</script>

<template>
  <div v-if="error" class="error-boundary" role="alert" aria-live="assertive">
    <div class="error-boundary-content">
      <span class="error-boundary-icon">⚠️</span>
      <p class="error-boundary-message">{{ fallbackMessage }}</p>
      <button class="error-boundary-retry" @click="retry">重试</button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  min-height: 120px;
}
.error-boundary-content {
  text-align: center;
  color: var(--color-text-secondary, #6b7280);
}
.error-boundary-icon {
  font-size: 2rem;
}
.error-boundary-message {
  margin: 0.5rem 0;
  font-size: 0.875rem;
}
.error-boundary-retry {
  margin-top: 0.5rem;
  padding: 0.25rem 1rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #6b7280);
  transition: background 0.15s;
}
.error-boundary-retry:hover {
  background: var(--color-bg-hover, #f3f4f6);
}
</style>
