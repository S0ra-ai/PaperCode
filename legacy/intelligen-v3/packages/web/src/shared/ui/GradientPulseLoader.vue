<script setup>
defineProps({
  text: {
    type: String,
    default: '加载中...'
  }
});
</script>

<template>
  <div class="gradient-loader-container">
    <div class="loader-content">
      <div class="gradient-loader">
        <svg class="spinner" viewBox="0 0 50 50">
          <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
        </svg>
      </div>
      <div v-if="text" class="loader-text">{{ text }}</div>
    </div>
  </div>
</template>

<style scoped>
.gradient-loader-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loader-text {
  font-size: 14px;
  color: var(--text-muted, #9ca3af);
  letter-spacing: 0.05em;
  animation: pulse-text 2.5s ease-in-out infinite;
}

.gradient-loader {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  /* Fallback color for dark/light themes */
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 65%);
  display: flex;
  justify-content: center;
  align-items: center;
  animation: pulse-bg 2s ease-in-out infinite;
}

.spinner {
  animation: rotate 2s linear infinite;
  width: 36px;
  height: 36px;
}

.spinner .path {
  stroke: var(--primary, #3b82f6);
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

@keyframes pulse-bg {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes pulse-text {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
</style>
