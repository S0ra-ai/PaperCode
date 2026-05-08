<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { THEME } from '@/shared/ui/colors'

import { getDashboard, getRealtimeMetrics, getSystemHealth } from '@/features/admin/api/dashboard'

const router = useRouter()

const loading = ref(true)
const dashboard = ref({
  total_users: 0,
  total_sessions: 0,
  total_tasks: 0,
  active_tasks: 0,
  queue_depth: 0,
  engine_status: 'unknown',
  recent_tasks: [],
})
const health = ref({
  api: 'unknown',
  database: 'unknown',
  redis: 'unknown',
  engine: 'unknown',
})
const metrics = ref({
  active_tasks: 0,
  queue_depth: 0,
  rpm_current: 0,
  tpm_current: 0,
  models: {},
})
const error = ref('')
let refreshTimer = null

function healthColor(status) {
  if (status === 'up' || status === 'UP') return THEME.success
  if (status === 'down') return THEME.danger
  return THEME.warning
}

function healthLabel(status) {
  if (status === 'up' || status === 'UP') return '正常'
  if (status === 'down') return '离线'
  return '未知'
}

function statusTag(status) {
  const map = {
    completed: { label: '已完成', color: THEME.success },
    failed: { label: '失败', color: THEME.danger },
    generating: { label: '生成中', color: THEME.primary },
    planning: { label: '规划中', color: THEME.purple },
    pending: { label: '等待中', color: THEME.warning },
    cancelled: { label: '已取消', color: THEME.muted },
  }
  return map[status] || { label: status, color: THEME.muted }
}

async function loadData() {
  try {
    const [dashRes, healthRes, metricsRes] = await Promise.allSettled([
      getDashboard(),
      getSystemHealth(),
      getRealtimeMetrics(),
    ])

    if (dashRes.status === 'fulfilled') dashboard.value = dashRes.value?.data ?? dashRes.value
    if (healthRes.status === 'fulfilled') health.value = healthRes.value?.data ?? healthRes.value
    if (metricsRes.status === 'fulfilled') metrics.value = metricsRes.value?.data ?? metricsRes.value
    error.value = ''
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  refreshTimer = setInterval(loadData, 30000) // Refresh every 30s
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="admin-dashboard">
      <div class="page-header">
        <h1>管理仪表盘</h1>
        <div class="header-actions">
          <button class="btn-secondary" @click="loadData" :disabled="loading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            刷新
          </button>
          <button class="btn-primary" @click="router.push('/admin/models')">模型配置</button>
          <button class="btn-primary" @click="router.push('/admin/users')">用户管理</button>
        </div>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon users-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ dashboard.total_users }}</span>
            <span class="stat-label">注册用户</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon sessions-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ dashboard.total_sessions }}</span>
            <span class="stat-label">总会话数</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon tasks-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ dashboard.total_tasks }}</span>
            <span class="stat-label">总任务数</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon active-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ dashboard.active_tasks }}</span>
            <span class="stat-label">活跃任务</span>
          </div>
        </div>
      </div>

      <!-- Health & Engine Status -->
      <div class="panels-grid">
        <div class="panel">
          <h3>系统健康</h3>
          <div class="health-grid">
            <div class="health-item" v-for="(status, key) in health" :key="key">
              <span class="health-dot" :style="{ background: healthColor(status) }"></span>
              <span class="health-name">{{ key.toUpperCase() }}</span>
              <span class="health-status" :style="{ color: healthColor(status) }">{{ healthLabel(status) }}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>引擎状态</h3>
          <div class="engine-stats">
            <div class="engine-stat">
              <span class="label">Engine</span>
              <span class="value" :style="{ color: healthColor(dashboard.engine_status) }">
                {{ healthLabel(dashboard.engine_status) }}
              </span>
            </div>
            <div class="engine-stat">
              <span class="label">队列深度</span>
              <span class="value">{{ dashboard.queue_depth }}</span>
            </div>
            <div class="engine-stat">
              <span class="label">活跃任务</span>
              <span class="value">{{ metrics.active_tasks }}</span>
            </div>
            <div class="engine-stat" v-for="(model, key) in metrics.models" :key="key">
              <span class="label">{{ key }}</span>
              <span class="value model-name">{{ model }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Tasks -->
      <div class="panel full-width">
        <h3>最近任务</h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>主题</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!dashboard.recent_tasks?.length">
                <td colspan="4" class="empty-cell">暂无任务</td>
              </tr>
              <tr v-for="task in dashboard.recent_tasks" :key="task.taskId">
                <td class="mono">{{ task.taskId?.substring(0, 8) }}…</td>
                <td>{{ task.topic || '—' }}</td>
                <td>
                  <span class="status-tag" :style="{ background: statusTag(task.status).color + '18', color: statusTag(task.status).color, borderColor: statusTag(task.status).color + '40' }">
                    {{ statusTag(task.status).label }}
                  </span>
                </td>
                <td>{{ task.createdAt ? new Date(task.createdAt).toLocaleString() : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
</template>

<style scoped>
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-strong);
  color: var(--btn-primary-text, #fff);
}

.btn-primary:hover { opacity: 0.9; }

.btn-secondary {
  background: var(--surface-strong);
  color: var(--text-main);
  border-color: var(--border-soft);
}

.btn-secondary:hover { background: var(--surface); }

.error-bar {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.users-icon { background: rgba(0, 112, 243, 0.08); color: var(--primary); }
.sessions-icon { background: rgba(16, 185, 129, 0.08); color: var(--success); }
.tasks-icon { background: rgba(114, 46, 209, 0.08); color: #722ed1; }
.active-icon { background: rgba(250, 140, 22, 0.08); color: #fa8c16; }

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.1;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.panels-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 20px;
}

.panel h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 16px 0;
}

.panel.full-width {
  grid-column: 1 / -1;
}

.health-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.health-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  min-width: 80px;
}

.health-status {
  font-size: 13px;
  font-weight: 500;
}

.engine-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.engine-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.engine-stat .label {
  font-size: 13px;
  color: var(--text-secondary);
}

.engine-stat .value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.engine-stat .model-name {
  font-size: 12px;
  font-family: monospace;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-soft);
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-main);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px 12px !important;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
}

@media (max-width: 768px) {
  .panels-grid { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .page-header { flex-direction: column; gap: 12px; align-items: flex-start; }
}
</style>
