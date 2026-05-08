<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  taskId: { type: String, required: true },
  versions: { type: Array, default: () => [] },
  currentContent: { type: String, default: '' },
});

const emit = defineEmits(['restore', 'preview']);

const selectedVersion = ref(null);
const compareMode = ref(false);
const compareVersionA = ref(null);
const compareVersionB = ref(null);

const sortedVersions = computed(() =>
  [...props.versions].sort((a, b) => {
    const tA = new Date(a.created_at || a.timestamp || 0).getTime();
    const tB = new Date(b.created_at || b.timestamp || 0).getTime();
    return tB - tA;
  })
);

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(content) {
  if (!content) return '-';
  const len = content.length;
  if (len < 1000) return `${len} 字`;
  return `${(len / 1000).toFixed(1)}K 字`;
}

function selectVersion(v) {
  selectedVersion.value = v;
  emit('preview', v);
}

function restoreVersion(v) {
  if (confirm(`确定要恢复到版本 ${v.version || v.id} 吗？当前内容将被替换。`)) {
    emit('restore', v);
  }
}

function toggleCompare() {
  compareMode.value = !compareMode.value;
  if (compareMode.value && sortedVersions.value.length >= 2) {
    compareVersionA.value = sortedVersions.value[1];
    compareVersionB.value = sortedVersions.value[0];
  }
}
</script>

<template>
  <div class="version-history">
    <div class="vh-header">
      <h3 class="vh-title">📜 版本历史</h3>
      <button class="compare-toggle" @click="toggleCompare" v-if="versions.length >= 2">
        {{ compareMode ? '退出对比' : '版本对比' }}
      </button>
    </div>

    <div v-if="versions.length === 0" class="vh-empty">
      暂无版本记录
    </div>

    <div v-else class="vh-list">
      <div
        v-for="(v, idx) in sortedVersions"
        :key="v.id || v.version || idx"
        class="vh-item"
        :class="{ active: selectedVersion === v }"
        @click="selectVersion(v)"
      >
        <div class="vh-item-header">
          <span class="vh-version">
            V{{ v.version || idx + 1 }}
            <span v-if="idx === 0" class="vh-latest-badge">最新</span>
          </span>
          <span class="vh-time">{{ formatTime(v.created_at || v.timestamp) }}</span>
        </div>
        <div class="vh-item-meta">
          <span class="vh-size">{{ formatSize(v.content) }}</span>
          <button
            class="vh-restore-btn"
            @click.stop="restoreVersion(v)"
            v-if="idx !== 0"
            title="恢复此版本"
          >
            恢复
          </button>
        </div>
      </div>
    </div>

    <!-- Side-by-side diff (compare mode) -->
    <div v-if="compareMode && compareVersionA && compareVersionB" class="vh-compare">
      <div class="compare-header">
        <span>V{{ compareVersionA.version || '旧' }}</span>
        <span>VS</span>
        <span>V{{ compareVersionB.version || '新' }}</span>
      </div>
      <div class="compare-body">
        <div class="compare-pane">
          <div class="compare-content">{{ (compareVersionA.content || '').slice(0, 800) }}...</div>
        </div>
        <div class="compare-pane">
          <div class="compare-content">{{ (compareVersionB.content || '').slice(0, 800) }}...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-history {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg, 12px);
  padding: 16px;
}

.vh-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.vh-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #f0f0f0);
  margin: 0;
}

.compare-toggle {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #888);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.compare-toggle:hover {
  background: rgba(0, 112, 243, 0.1);
  color: var(--text-primary, #f0f0f0);
}

.vh-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.vh-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.vh-item {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.vh-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(0, 112, 243, 0.2);
}

.vh-item.active {
  border-color: var(--primary, #0070F3);
  background: rgba(0, 112, 243, 0.06);
}

.vh-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vh-version {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #f0f0f0);
  display: flex;
  align-items: center;
  gap: 6px;
}

.vh-latest-badge {
  font-size: 10px;
  background: var(--primary, #0070F3);
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.vh-time {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.vh-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.vh-size {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.vh-restore-btn {
  background: rgba(0, 112, 243, 0.1);
  border: 1px solid rgba(0, 112, 243, 0.2);
  color: var(--primary, #0070F3);
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.vh-restore-btn:hover {
  background: rgba(0, 112, 243, 0.2);
}

.vh-compare {
  margin-top: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow: hidden;
}

.compare-header {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: var(--text-secondary, #888);
  font-weight: 500;
}

.compare-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.compare-pane {
  background: rgba(0, 0, 0, 0.15);
}

.compare-content {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary, #aaa);
  max-height: 250px;
  overflow-y: auto;
  white-space: pre-wrap;
}
</style>
