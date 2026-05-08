<script setup>
import { ref, onMounted, computed } from 'vue'
import { THEME } from '@/shared/ui/colors'

import { getUsers, updateUserRole } from '@/features/admin/api/dashboard'
import { auditUser } from '@/features/admin/api/admin'

const loading = ref(true)
const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const error = ref('')
const actionLoading = ref('')

const roleOptions = [
  { value: 'admin', label: '管理员' },
  { value: 'teacher', label: '教师' },
  { value: 'student', label: '学生' },
  { value: 'user', label: '普通用户' },
]

const authStatusMap = {
  0: { label: '待审核', color: THEME.warning },
  1: { label: '已通过', color: THEME.success },
  2: { label: '已禁用', color: THEME.danger },
}

function authStatusTag(status) {
  return authStatusMap[status] || { label: '未知', color: '#8c8c8c' }
}

function roleLabel(role) {
  const found = roleOptions.find(r => r.value === role)
  return found ? found.label : role
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await getUsers({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
    })
    // unwrapApiResponse returns {code, message, data}; extract data
    const data = res?.data ?? res
    if (data && data.list) {
      users.value = data.list
      total.value = data.total || 0
    } else if (Array.isArray(data)) {
      users.value = data
      total.value = data.length
    } else {
      users.value = []
      total.value = 0
    }
    error.value = ''
  } catch (e) {
    error.value = e.message || '加载用户列表失败'
  } finally {
    loading.value = false
  }
}

async function handleRoleChange(user, newRole) {
  if (newRole === user.role) return
  actionLoading.value = user.userId
  try {
    await updateUserRole(user.userId, newRole)
    user.role = newRole
  } catch (e) {
    error.value = e.message || '角色更新失败'
  } finally {
    actionLoading.value = ''
  }
}

async function handleAudit(user, status) {
  actionLoading.value = user.userId
  try {
    await auditUser(user.userId, { authStatus: status })
    user.authStatus = status
  } catch (e) {
    error.value = e.message || '审核操作失败'
  } finally {
    actionLoading.value = ''
  }
}

function handleSearch() {
  page.value = 1
  loadUsers()
}

function handlePageChange(newPage) {
  page.value = newPage
  loadUsers()
}

const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

onMounted(loadUsers)
</script>

<template>
  <div class="user-mgmt-page">
      <div class="page-header">
        <h1>用户管理</h1>
        <span class="user-count">共 {{ total }} 位用户</span>
      </div>

      <!-- Search -->
      <div class="search-bar">
        <input
          type="text"
          v-model="keyword"
          placeholder="搜索用户名、昵称或邮箱…"
          @keyup.enter="handleSearch"
        />
        <button class="btn-primary" @click="handleSearch" :disabled="loading">搜索</button>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <!-- Users Table -->
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>昵称</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>审核状态</th>
              <th>任务数</th>
              <th>会话数</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && !users.length">
              <td colspan="9" class="empty-cell">加载中…</td>
            </tr>
            <tr v-else-if="!users.length">
              <td colspan="9" class="empty-cell">暂无用户</td>
            </tr>
            <tr v-for="user in users" :key="user.userId">
              <td class="mono">{{ user.username }}</td>
              <td>{{ user.nickname }}</td>
              <td>{{ user.email || '—' }}</td>
              <td>
                <select
                  class="role-select"
                  :value="user.role"
                  @change="handleRoleChange(user, $event.target.value)"
                  :disabled="actionLoading === user.userId"
                >
                  <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </td>
              <td>
                <span
                  class="status-tag"
                  :style="{
                    background: authStatusTag(user.authStatus).color + '18',
                    color: authStatusTag(user.authStatus).color,
                    borderColor: authStatusTag(user.authStatus).color + '40',
                  }"
                >
                  {{ authStatusTag(user.authStatus).label }}
                </span>
              </td>
              <td>{{ user.taskCount ?? 0 }}</td>
              <td>{{ user.sessionCount ?? 0 }}</td>
              <td>{{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' }}</td>
              <td class="actions-cell">
                <button
                  v-if="user.authStatus !== 1"
                  class="btn-tiny btn-approve"
                  @click="handleAudit(user, 1)"
                  :disabled="actionLoading === user.userId"
                >通过</button>
                <button
                  v-if="user.authStatus !== 2"
                  class="btn-tiny btn-disable"
                  @click="handleAudit(user, 2)"
                  :disabled="actionLoading === user.userId"
                >禁用</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination" v-if="totalPages > 1">
        <button class="page-btn" :disabled="page <= 1" @click="handlePageChange(page - 1)">‹</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="handlePageChange(page + 1)">›</button>
      </div>
    </div>
</template>

<style scoped>
.user-mgmt-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.user-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-bar input {
  flex: 1;
  max-width: 400px;
  padding: 8px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  font-size: 13px;
  background: var(--surface);
  color: var(--text-main);
  outline: none;
}

.search-bar input:focus {
  border-color: var(--primary-strong);
}

.btn-primary {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: var(--primary-strong);
  color: var(--btn-primary-text, #fff);
  transition: opacity 0.2s;
}

.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.error-bar {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}

.table-wrapper {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-soft);
  white-space: nowrap;
  background: var(--surface-strong);
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-main);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tr:hover td {
  background: var(--surface-strong);
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

.role-select {
  padding: 4px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 12px;
  background: var(--surface);
  color: var(--text-main);
  cursor: pointer;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
}

.actions-cell {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.btn-tiny {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s;
}

.btn-approve {
  background: rgba(16, 185, 129, 0.08);
  color: var(--success);
  border-color: rgba(16, 185, 129, 0.3);
}

.btn-approve:hover { background: rgba(16, 185, 129, 0.15); }

.btn-disable {
  background: var(--danger-light);
  color: var(--danger);
  border-color: var(--danger-border);
}

.btn-disable:hover { background: rgba(239, 68, 68, 0.12); }

.btn-tiny:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.page-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-main);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-btn:hover:not(:disabled) { background: var(--surface-strong); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
