<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { auditUser, getPendingUsers } from '@/features/admin/api/admin';

const pendingUsers = ref([]);
const total = ref(0);
const loading = reactive({ pendingUsers: false, auditUserIds: {} });
const feedback = reactive({ type: '', text: '' });
const filters = reactive({ page: 1, pageSize: 20, keyword: '', role: '' });

const roleLabelMap = { student: '学生', teacher: '教师', user: '普通用户', admin: '管理员' };
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / filters.pageSize || 1)));

function setFeedback(type, text) {
  feedback.type = type;
  feedback.text = text;
  if (text) {
    setTimeout(() => {
      if (feedback.text === text) {
        feedback.type = '';
        feedback.text = '';
      }
    }, 3000);
  }
}
function formatRole(role) { return roleLabelMap[role] || role || '未知角色'; }
function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isAuditingUser(userId) { return Boolean(loading.auditUserIds[userId]); }
function setAuditingUser(userId, action) { loading.auditUserIds = { ...loading.auditUserIds, [userId]: action }; }

function clearFilters() { filters.keyword = ''; filters.role = ''; filters.page = 1; loadPendingUsers(); }
function changePage(next) {
  const p = Math.min(Math.max(next, 1), totalPages.value);
  if (p !== filters.page) { filters.page = p; loadPendingUsers(); }
}

async function loadPendingUsers() {
  loading.pendingUsers = true;
  try {
    const response = await getPendingUsers({ page: filters.page, pageSize: filters.pageSize, keyword: filters.keyword, role: filters.role });
    pendingUsers.value = response.data.list || [];
    total.value = response.data.total || 0;
  } catch (error) { setFeedback('error', error.message); } 
  finally { loading.pendingUsers = false; }
}

async function handleAudit(userId, action) {
  if (isAuditingUser(userId)) return;
  let reason = '审核通过';
  if (action === 'reject') {
    const promptedReason = window.prompt('请输入驳回原因', '资料不完整');
    if (promptedReason === null) return;
    reason = promptedReason.trim() || '资料不完整';
  }
  setAuditingUser(userId, action);
  try {
    const authStatus = action === 'approve' ? 1 : 2;
    await auditUser(userId, { authStatus });
    setFeedback('success', action === 'approve' ? '审核通过' : '已驳回');
    await loadPendingUsers();
  } catch (error) { setFeedback('error', error.message); } 
  finally { setAuditingUser(userId, ''); }
}

onMounted(loadPendingUsers);
watch(() => [filters.keyword, filters.role, filters.pageSize], () => { filters.page = 1; });
</script>

<template>
  <div class="admin-page">
    <header class="admin-header">
      <div>
        <h1 class="page-title">审核中心</h1>
        <p class="page-subtitle">管理新注册账号的访问权限。可按角色筛选，或搜索用户名/邮箱进行定向审核。</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" @click="loadPendingUsers" :disabled="loading.pendingUsers">
          {{ loading.pendingUsers ? '刷新中' : '刷新' }}
        </button>
      </div>
    </header>

    <div v-if="feedback.text" class="message-bar" :class="feedback.type === 'error' ? 'message-error' : 'message-success'">
      {{ feedback.text }}
    </div>

    <section class="section-card">
      <div class="filter-row">
        <input v-model.trim="filters.keyword" class="field-input" placeholder="检索关键字..." />
        <select v-model="filters.role" class="field-select">
          <option value="">全部角色</option>
          <option value="student">学生</option>
          <option value="teacher">教师</option>
        </select>
        <button class="btn btn-secondary" @click="clearFilters">清空</button>
      </div>

      <div v-if="pendingUsers.length" class="table-shell mt-4">
        <table class="data-table">
          <thead>
            <tr>
              <th>申请人</th>
              <th>角色</th>
              <th>联系方式</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in pendingUsers" :key="user.userId">
              <td>
                <strong>{{ user.nickname || user.username }}</strong>
                <div class="helper-text">{{ user.username }}</div>
              </td>
              <td>{{ formatRole(user.role) }}</td>
              <td class="table-muted">{{ user.email || '-' }}</td>
              <td class="table-muted">{{ formatDate(user.createdAt) }}</td>
              <td>
                <div class="audit-actions">
                  <button class="btn-action btn-approve" :disabled="loading.pendingUsers || isAuditingUser(user.userId)" @click="handleAudit(user.userId, 'approve')">通过</button>
                  <button class="btn-action btn-reject" :disabled="loading.pendingUsers || isAuditingUser(user.userId)" @click="handleAudit(user.userId, 'reject')">驳回</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state mt-4">暂无待审核数据</div>

      <div class="pagination-bar mt-4">
        <button class="btn btn-secondary" :disabled="filters.page <= 1" @click="changePage(filters.page - 1)">上一页</button>
        <span class="helper-text">{{ filters.page }} / {{ totalPages }}</span>
        <button class="btn btn-secondary" :disabled="filters.page >= totalPages" @click="changePage(filters.page + 1)">下一页</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-page { width: min(1200px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 24px; padding-bottom: 40px; }
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-title { font-size: 28px; margin: 0; color: var(--text-main); font-weight: 600; }
.section-card { background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 24px; }

.filter-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px auto; gap: 12px; }
.mt-4 { margin-top: 16px; }

.table-shell { border-radius: var(--radius-md); border: 1px solid var(--border-soft); background: var(--table-bg); overflow: auto; }
.data-table { width: 100%; min-width: 800px; border-collapse: collapse; text-align: left; }
.data-table th, .data-table td { padding: 14px 16px; border-bottom: 1px solid var(--border-soft); }
.data-table th { background: var(--table-header-bg); color: var(--text-muted); font-size: 12px; text-transform: uppercase; font-weight: 600; }
.data-table tbody tr:hover { background: var(--table-hover-bg); }
.table-muted { color: var(--text-muted); font-size: 13px; }
.empty-state { padding: 40px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-soft); border-radius: var(--radius-md); }

.pagination-bar { display: flex; justify-content: space-between; align-items: center; }

.audit-actions { display: flex; gap: 8px; align-items: center; }
.btn-action { font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 999px; transition: all 0.2s ease; border: 1px solid transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-approve { background: rgba(16, 185, 129, 0.1); color: #059669; }
.btn-approve:hover:not(:disabled) { background: #10b981; color: #ffffff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); transform: translateY(-1px); }
.btn-reject { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
.btn-reject:hover:not(:disabled) { background: #ef4444; color: #ffffff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); transform: translateY(-1px); }
</style>
