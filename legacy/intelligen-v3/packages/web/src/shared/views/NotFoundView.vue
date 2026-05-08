<template>
  <div class="not-found">
    <h1>404</h1>
    <p>页面未找到</p>
    <router-link to="/" class="back-link">返回首页</router-link>
  </div>
</template>

<script setup>
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  font-family: var(--font-sans, system-ui, sans-serif);
  color: var(--text-main, #1a1a2e);
}
.not-found h1 {
  font-size: 6rem;
  font-weight: 800;
  margin: 0;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.not-found p {
  font-size: 1.25rem;
  margin: 0.5rem 0 1.5rem;
  color: var(--text-muted, #64748b);
}
.back-link {
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
  transition: opacity 0.2s;
}
.back-link:hover { opacity: 0.9; }
</style>
