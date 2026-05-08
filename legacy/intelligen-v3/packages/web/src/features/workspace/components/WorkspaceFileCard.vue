<script setup>
const props = defineProps({
  fileName: { type: String, default: '' },
  fileType: { type: String, default: '' },
  badge: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['click']);

function handleClick() {
  if (props.disabled) {
    return;
  }
  emit('click');
}

function getTypeLabel(fileType = '') {
  const normalized = String(fileType || '').trim().toLowerCase();
  if (!normalized) {
    return 'FILE';
  }
  if (normalized.includes('/')) {
    return normalized.split('/').at(-1).toUpperCase();
  }
  return normalized.replace(/^\./, '').toUpperCase();
}
</script>

<template>
  <button
    class="workspace-file-card"
    :class="{
      'workspace-file-card-active': active,
      'workspace-file-card-disabled': disabled
    }"
    type="button"
    :disabled="disabled"
    @click="handleClick"
  >
    <span class="workspace-file-card-icon">{{ getTypeLabel(fileType).slice(0, 4) }}</span>
    <span class="workspace-file-card-copy">
      <strong>{{ fileName || '未命名文件' }}</strong>
      <span>{{ subtitle || getTypeLabel(fileType) }}</span>
    </span>
    <span v-if="badge" class="workspace-file-card-badge">{{ badge }}</span>
  </button>
</template>

<style scoped>
.workspace-file-card {
  width: 100%;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  text-align: left;
}

.workspace-file-card:hover {
  transform: translateY(-1px);
  border-color: rgba(59, 130, 246, 0.32);
  box-shadow: var(--shadow-card);
}

.workspace-file-card-active {
  border-color: rgba(59, 130, 246, 0.36);
  background: rgba(59, 130, 246, 0.08);
}

.workspace-file-card-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.workspace-file-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.workspace-file-card-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-file-card-copy strong,
.workspace-file-card-copy span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-file-card-copy strong {
  font-size: 15px;
  color: var(--text-main);
}

.workspace-file-card-copy span {
  font-size: 13px;
  color: var(--text-muted);
}

.workspace-file-card-badge {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
</style>
