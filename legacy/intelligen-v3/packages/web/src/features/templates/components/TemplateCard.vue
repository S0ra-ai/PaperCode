<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  template: { type: Object, required: true },
});

const emit = defineEmits(['view', 'edit', 'delete', 'submit-review']);

const typeLabels = {
  builtin: '内置',
  journal: '期刊',
  school: '学校',
  custom: '自定义',
};

const statusLabels = {
  draft: '草稿',
  pending: '审核中',
  approved: '已审核',
  rejected: '已拒绝',
};

const statusColors = {
  draft: '#909399',
  pending: '#E6A23C',
  approved: '#67C23A',
  rejected: '#F56C6C',
};

const typeLabel = computed(() => typeLabels[props.template.type] || props.template.type);
const statusLabel = computed(() => statusLabels[props.template.status] || props.template.status);
const statusColor = computed(() => statusColors[props.template.status] || '#909399');
</script>

<template>
  <div class="template-card" @click="emit('view', template)">
    <div class="card-header">
      <h3 class="card-title">{{ template.name }}</h3>
      <span class="status-badge" :style="{ background: statusColor }">{{ statusLabel }}</span>
    </div>

    <p class="card-desc">{{ template.description || '暂无描述' }}</p>

    <div class="card-meta">
      <span class="meta-tag type-tag">{{ typeLabel }}</span>
      <span v-if="template.school" class="meta-tag">{{ template.school }}</span>
      <span v-if="template.journalName" class="meta-tag">{{ template.journalName }}</span>
    </div>

    <div class="card-footer">
      <span class="card-date">{{ template.createdAt?.slice(0, 10) }}</span>
      <div class="card-actions" @click.stop>
        <button class="action-btn" @click="emit('edit', template)" title="编辑">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button
          v-if="template.status === 'draft' || template.status === 'rejected'"
          class="action-btn"
          @click="emit('submit-review', template)"
          title="提交审核"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>
        </button>
        <button class="action-btn danger" @click="emit('delete', template)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-card {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.template-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-card);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  font-size: 11px;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
  margin-left: 8px;
}
.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-secondary);
}
.type-tag {
  color: var(--primary);
  font-weight: 500;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-date {
  font-size: 12px;
  color: var(--text-muted);
}
.card-actions {
  display: flex;
  gap: 4px;
}
.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--surface-strong);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.action-btn:hover {
  background: var(--primary);
  color: #fff;
}
.action-btn.danger:hover {
  background: #F56C6C;
}
</style>
