<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getUserTasks, retryTask, cancelTask } from '@/features/workspace/api/task';

const router = useRouter();

// ─── 状态 ───────────────────────────────────────────────
const loading = ref(false);
const tasks = ref([]);
const total = ref(0);
const activeTab = ref('all');
const pagination = reactive({ page: 1, perPage: 20 });
const flash = reactive({ type: '', text: '' });

const statusMap = {
  all: null,
  running: 'pending,processing,running',
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
};

const tabs = [
  { name: 'all', label: '全部' },
  { name: 'running', label: '进行中' },
  { name: 'completed', label: '已完成' },
  { name: 'failed', label: '失败' },
];

const statusConfig = {
  pending:    { label: '排队中', color: '#909399', type: 'info' },
  processing: { label: '处理中', color: '#409EFF', type: '' },
  running:    { label: '生成中', color: '#409EFF', type: '' },
  completed:  { label: '已完成', color: '#67C23A', type: 'success' },
  failed:     { label: '失败',   color: '#F56C6C', type: 'danger' },
  cancelled:  { label: '已取消', color: '#909399', type: 'info' },
};

const totalPages = computed(() => Math.ceil(total.value / pagination.perPage) || 1);

function setFlash(type, text) {
  flash.type = type;
  flash.text = text;
  setTimeout(() => { flash.type = ''; flash.text = ''; }, 3000);
}

// ─── 数据获取 ─────────────────────────────────────────────
async function fetchTasks() {
  loading.value = true;
  try {
    const params = { page: pagination.page, per_page: pagination.perPage };
    const statusFilter = statusMap[activeTab.value];
    if (statusFilter) params.status = statusFilter;

    const res = await getUserTasks(params);
    const data = res?.data ?? res;
    tasks.value = data?.items || [];
    total.value = data?.total || 0;
  } catch (e) {
    console.warn('获取任务列表失败:', e);
    setFlash('error', '获取任务列表失败');
  } finally {
    loading.value = false;
  }
}

function onTabChange() {
  pagination.page = 1;
  fetchTasks();
}

function onPageChange(page) {
  pagination.page = page;
  fetchTasks();
}

// ─── 操作 ─────────────────────────────────────────────────
function viewTask(task) {
  router.push({ path: '/app', query: { taskId: task.taskId, sessionId: task.sessionId } });
}

async function handleRetry(task) {
  if (!confirm('确认重新生成此任务？')) return;
  try {
    await retryTask(task.taskId);
    setFlash('success', '任务已重新提交');
    fetchTasks();
  } catch {
    setFlash('error', '重试失败');
  }
}

async function handleCancel(task) {
  if (!confirm('确认取消此任务？')) return;
  try {
    await cancelTask(task.taskId);
    setFlash('success', '任务已取消');
    fetchTasks();
  } catch {
    setFlash('error', '取消失败');
  }
}

// ─── 工具 ─────────────────────────────────────────────────
function getStatusInfo(status) {
  return statusConfig[status] || { label: status, color: '#909399', type: 'info' };
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractTitle(task) {
  const input = task.userInput || '';
  return input.length > 60 ? input.slice(0, 60) + '…' : input || '未命名任务';
}

// ─── 初始化 ───────────────────────────────────────────────
onMounted(fetchTasks);
</script>

<template>
  <div class="task-center">
    <!-- 消息提示 -->
    <div v-if="flash.text" class="flash-banner" :class="'flash-' + flash.type">
      {{ flash.text }}
    </div>

    <header class="task-center-header">
      <h2 class="page-title">任务中心</h2>
      <p class="page-desc">查看和管理所有论文生成任务</p>
    </header>

    <!-- 状态筛选 -->
    <div class="filter-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.name"
        class="filter-tab"
        :class="{ active: activeTab === tab.name }"
        @click="activeTab = tab.name; onTabChange()"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载中…</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="tasks.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary, #c0c4cc)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      </div>
      <p class="empty-text">暂无任务</p>
      <button class="btn-primary" @click="router.push('/app')">去创建</button>
    </div>

    <!-- 任务列表 -->
    <div v-else class="task-list">
      <div
        v-for="task in tasks"
        :key="task.taskId"
        class="task-item"
        @click="viewTask(task)"
      >
        <div class="task-item-header">
          <h3 class="task-title">{{ extractTitle(task) }}</h3>
          <span
            class="status-badge"
            :style="{ background: getStatusInfo(task.status).color + '1a', color: getStatusInfo(task.status).color }"
          >
            {{ getStatusInfo(task.status).label }}
          </span>
        </div>

        <!-- 进度条 -->
        <div v-if="task.status === 'running' || task.status === 'processing'" class="progress-row">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: (task.progress || 0) + '%' }"></div>
          </div>
          <span class="progress-text">{{ Math.round(task.progress || 0) }}%</span>
        </div>

        <div class="task-item-meta">
          <span class="meta-item">创建：{{ formatTime(task.createdAt) }}</span>
          <span v-if="task.completedAt" class="meta-item">完成：{{ formatTime(task.completedAt) }}</span>
        </div>

        <!-- 操作 -->
        <div class="task-item-actions" @click.stop>
          <button class="action-btn" @click="viewTask(task)">查看</button>
          <button
            v-if="task.status === 'failed'"
            class="action-btn retry"
            @click="handleRetry(task)"
          >重试</button>
          <button
            v-if="task.status === 'running' || task.status === 'pending' || task.status === 'processing'"
            class="action-btn cancel"
            @click="handleCancel(task)"
          >取消</button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pagination.perPage" class="pagination">
      <button
        class="page-btn"
        :disabled="pagination.page <= 1"
        @click="onPageChange(pagination.page - 1)"
      >上一页</button>
      <span class="page-info">{{ pagination.page }} / {{ totalPages }}</span>
      <button
        class="page-btn"
        :disabled="pagination.page >= totalPages"
        @click="onPageChange(pagination.page + 1)"
      >下一页</button>
    </div>
  </div>
</template>

<style scoped>
.task-center {
  max-width: 960px;
  margin: 0 auto;
  padding: 8px 0;
}

.task-center-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main, #303133);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin: 0;
}

/* 筛选标签 */
.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.filter-tab {
  padding: 6px 18px;
  border-radius: 8px;
  border: 1px solid var(--border-soft, #dcdfe6);
  background: var(--surface, #fff);
  color: var(--text-secondary, #606266);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-tab:hover {
  border-color: var(--primary, #409eff);
  color: var(--primary, #409eff);
}

.filter-tab.active {
  background: var(--primary, #409eff);
  color: #fff;
  border-color: var(--primary, #409eff);
}

/* 加载 */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--text-secondary, #909399);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-soft, #dcdfe6);
  border-top-color: var(--primary, #409eff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-text {
  color: var(--text-tertiary, #c0c4cc);
  margin: 0 0 20px 0;
  font-size: 15px;
}

.btn-primary {
  padding: 8px 24px;
  border-radius: 8px;
  background: var(--primary, #409eff);
  color: #fff;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover {
  opacity: 0.85;
}

/* 任务列表 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  background: var(--surface, #fff);
  border: 1px solid var(--border-soft, #ebeef5);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: var(--primary, #409eff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.task-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.task-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main, #303133);
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 12px;
}

/* 进度条 */
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border-soft, #ebeef5);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary, #409eff);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  flex-shrink: 0;
  width: 36px;
  text-align: right;
}

/* 元信息 */
.task-item-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.meta-item {
  font-size: 12px;
  color: var(--text-tertiary, #c0c4cc);
}

/* 操作 */
.task-item-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-soft, #dcdfe6);
  background: var(--surface, #fff);
  color: var(--text-secondary, #606266);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary, #409eff);
  color: var(--primary, #409eff);
}

.action-btn.retry {
  border-color: #e6a23c;
  color: #e6a23c;
}

.action-btn.retry:hover {
  background: #e6a23c;
  color: #fff;
}

.action-btn.cancel {
  border-color: #f56c6c;
  color: #f56c6c;
}

.action-btn.cancel:hover {
  background: #f56c6c;
  color: #fff;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}

.page-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-soft, #dcdfe6);
  background: var(--surface, #fff);
  color: var(--text-secondary, #606266);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--primary, #409eff);
  color: var(--primary, #409eff);
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* 消息提示 */
.flash-banner {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 16px;
  animation: flash-in 0.3s ease;
}

.flash-success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.flash-error {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

@keyframes flash-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
