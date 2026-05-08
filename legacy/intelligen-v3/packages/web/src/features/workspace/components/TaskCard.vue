<script setup>
/**
 * TaskCard — 对话中内联显示的紧凑任务卡片
 * 用于在消息流中展示任务状态
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  task: { type: Object, required: true },
});

const router = useRouter();

const statusConfig = {
  pending:    { label: '排队中', color: '#909399', bgColor: '#9093991a' },
  processing: { label: '处理中', color: '#409EFF', bgColor: '#409EFF1a' },
  running:    { label: '生成中', color: '#409EFF', bgColor: '#409EFF1a' },
  completed:  { label: '已完成', color: '#67C23A', bgColor: '#67C23A1a' },
  failed:     { label: '失败',   color: '#F56C6C', bgColor: '#F56C6C1a' },
  cancelled:  { label: '已取消', color: '#909399', bgColor: '#9093991a' },
};

const statusInfo = computed(() =>
  statusConfig[props.task.status] || { label: props.task.status, color: '#909399', bgColor: '#9093991a' }
);

const title = computed(() => {
  const input = props.task.userInput || '';
  return input.length > 50 ? input.slice(0, 50) + '…' : input || '未命名任务';
});

const showProgress = computed(() =>
  props.task.status === 'running' || props.task.status === 'processing'
);

function viewDetail() {
  router.push({ path: '/app', query: { taskId: props.task.taskId, sessionId: props.task.sessionId } });
}
</script>

<template>
  <div class="task-card-inline" :class="'status-' + task.status">
    <div class="tc-header">
      <span class="tc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
      </span>
      <span class="tc-title">{{ title }}</span>
      <span
        class="tc-status"
        :style="{ background: statusInfo.bgColor, color: statusInfo.color }"
      >{{ statusInfo.label }}</span>
    </div>

    <div v-if="showProgress" class="tc-progress">
      <div class="tc-progress-bar">
        <div
          class="tc-progress-fill"
          :style="{ width: (task.progress || 0) + '%' }"
        ></div>
      </div>
      <span class="tc-progress-text">{{ Math.round(task.progress || 0) }}%</span>
    </div>

    <div class="tc-footer">
      <button class="tc-detail-btn" @click.stop="viewDetail">查看详情</button>
    </div>
  </div>
</template>

<style scoped>
.task-card-inline {
  background: var(--surface, #fff);
  border: 1px solid var(--border-soft, #ebeef5);
  border-radius: 10px;
  padding: 12px 16px;
  margin: 4px 0;
  max-width: 400px;
  transition: border-color 0.2s;
}

.task-card-inline:hover {
  border-color: var(--primary, #409eff);
}

.task-card-inline.status-running,
.task-card-inline.status-processing {
  border-left: 3px solid #409EFF;
}

.task-card-inline.status-completed {
  border-left: 3px solid #67C23A;
}

.task-card-inline.status-failed {
  border-left: 3px solid #F56C6C;
}

.tc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tc-icon {
  flex-shrink: 0;
  color: var(--text-tertiary, #c0c4cc);
  display: flex;
}

.tc-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-status {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.tc-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tc-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border-soft, #ebeef5);
  border-radius: 2px;
  overflow: hidden;
}

.tc-progress-fill {
  height: 100%;
  background: var(--primary, #409eff);
  border-radius: 2px;
  transition: width 0.3s;
}

.tc-progress-text {
  font-size: 11px;
  color: var(--text-tertiary, #c0c4cc);
  width: 30px;
  text-align: right;
}

.tc-footer {
  display: flex;
  justify-content: flex-end;
}

.tc-detail-btn {
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-soft, #dcdfe6);
  background: transparent;
  color: var(--primary, #409eff);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tc-detail-btn:hover {
  background: var(--primary, #409eff);
  color: #fff;
  border-color: var(--primary, #409eff);
}
</style>
