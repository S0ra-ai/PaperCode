<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  selectedSessionId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select', 'create', 'delete', 'rename', 'pin', 'unpin',
]);

const searchQuery = ref('');
const sortBy = ref('date'); // 'date' | 'name' | 'pinned'
const renamingId = ref('');
const renameValue = ref('');

// Pinned sessions (persisted in localStorage)
const pinnedIds = ref(new Set(JSON.parse(localStorage.getItem('pinnedSessions') || '[]')));

function savePinned() {
  localStorage.setItem('pinnedSessions', JSON.stringify([...pinnedIds.value]));
}

function togglePin(sessionId) {
  if (pinnedIds.value.has(sessionId)) {
    pinnedIds.value.delete(sessionId);
    emit('unpin', sessionId);
  } else {
    pinnedIds.value.add(sessionId);
    emit('pin', sessionId);
  }
  savePinned();
}

function isPinned(sessionId) {
  return pinnedIds.value.has(sessionId);
}

const filteredSessions = computed(() => {
  let list = [...props.sessions];

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((s) => {
      const title = (s.title || s.sessionId || '').toLowerCase();
      const topic = (s.topic || '').toLowerCase();
      return title.includes(q) || topic.includes(q);
    });
  }

  // Sort
  list.sort((a, b) => {
    // Pinned first
    const aPinned = pinnedIds.value.has(a.sessionId) ? 0 : 1;
    const bPinned = pinnedIds.value.has(b.sessionId) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;

    if (sortBy.value === 'name') {
      return (a.title || '').localeCompare(b.title || '');
    }
    // Default: date desc
    const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tB - tA;
  });

  return list;
});

function startRename(session) {
  renamingId.value = session.sessionId;
  renameValue.value = session.title || '';
}

function confirmRename(session) {
  if (renameValue.value.trim() && renameValue.value !== session.title) {
    emit('rename', { sessionId: session.sessionId, title: renameValue.value.trim() });
  }
  renamingId.value = '';
}

function cancelRename() {
  renamingId.value = '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
</script>

<template>
  <div class="session-sidebar">
    <!-- Search -->
    <div class="sidebar-search">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索会话..."
        type="text"
      />
      <select v-model="sortBy" class="sort-select">
        <option value="date">按时间</option>
        <option value="name">按名称</option>
      </select>
    </div>

    <!-- New session button -->
    <button class="new-session-btn" @click="$emit('create')" :disabled="loading">
      ➕ 新建会话
    </button>

    <!-- Session list -->
    <div class="session-list">
      <div
        v-for="session in filteredSessions"
        :key="session.sessionId"
        class="session-item"
        :class="{
          active: selectedSessionId === session.sessionId,
          pinned: isPinned(session.sessionId),
        }"
        @click="$emit('select', session.sessionId)"
      >
        <div class="session-item-header">
          <span v-if="isPinned(session.sessionId)" class="pin-icon">📌</span>

          <template v-if="renamingId === session.sessionId">
            <input
              v-model="renameValue"
              class="rename-input"
              @keyup.enter="confirmRename(session)"
              @keyup.escape="cancelRename"
              @blur="confirmRename(session)"
              autofocus
              @click.stop
            />
          </template>
          <template v-else>
            <span class="session-title">
              {{ session.title || '未命名会话' }}
            </span>
          </template>
        </div>

        <div class="session-item-meta">
          <span class="session-time">{{ formatDate(session.updatedAt || session.createdAt) }}</span>
          <div class="session-item-actions" @click.stop>
            <button class="micro-btn" @click="togglePin(session.sessionId)" :title="isPinned(session.sessionId) ? '取消置顶' : '置顶'">
              {{ isPinned(session.sessionId) ? '📌' : '📍' }}
            </button>
            <button class="micro-btn" @click="startRename(session)" title="重命名">✏️</button>
            <button class="micro-btn danger" @click="$emit('delete', session.sessionId)" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="filteredSessions.length === 0 && searchQuery" class="no-results">
      未找到匹配的会话
    </div>
  </div>
</template>

<style scoped>
.session-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.sidebar-search {
  display: flex;
  gap: 6px;
}

.search-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary, #f0f0f0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--primary, #0070F3);
}

.search-input::placeholder {
  color: var(--text-secondary, #666);
}

.sort-select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text-secondary, #888);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.new-session-btn {
  background: rgba(0, 112, 243, 0.08);
  border: 1px dashed rgba(0, 112, 243, 0.3);
  color: var(--primary, #0070F3);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.new-session-btn:hover:not(:disabled) {
  background: rgba(0, 112, 243, 0.15);
}

.new-session-btn:disabled {
  opacity: 0.5;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.session-item {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.session-item.active {
  background: rgba(0, 112, 243, 0.08);
  border-color: rgba(0, 112, 243, 0.2);
}

.session-item.pinned {
  border-left: 2px solid var(--primary, #0070F3);
}

.session-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pin-icon {
  font-size: 11px;
}

.session-title {
  font-size: 13px;
  color: var(--text-primary, #f0f0f0);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--primary, #0070F3);
  border-radius: 4px;
  color: var(--text-primary, #f0f0f0);
  padding: 2px 6px;
  font-size: 13px;
  outline: none;
}

.session-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.session-time {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.session-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-item:hover .session-item-actions {
  opacity: 1;
}

.micro-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
  transition: background 0.15s;
}

.micro-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.micro-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

.no-results {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #666);
  font-size: 12px;
}
</style>
