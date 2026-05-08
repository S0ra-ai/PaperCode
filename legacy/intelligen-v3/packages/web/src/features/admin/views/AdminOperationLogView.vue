<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { getOperationLogs } from '@/features/admin/api/admin';

const operationLogs = ref([]);
const total = ref(0);
const loading = ref(false);
const feedback = reactive({
  type: '',
  text: ''
});

const filters = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  operatorKeyword: '',
  actionCode: '',
  requestId: ''
});

const totalPages = computed(() => Math.max(1, Math.ceil((total.value || 0) / filters.pageSize || 1)));

function setFeedback(type, text) {
  feedback.type = type;
  feedback.text = text;
}

function clearFeedback() {
  feedback.type = '';
  feedback.text = '';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(date);
}

function formatResult(item) {
  if (!item) {
    return '-';
  }
  const prefix = item.success === false ? '失败' : '成功';
  return item.responseStatus ? `${prefix} (${item.responseStatus})` : prefix;
}

function formatTarget(item) {
  if (!item) {
    return '-';
  }
  if (item.resourceType && item.resourceId) {
    return `${item.resourceType}:${item.resourceId}`;
  }
  if (item.resourceId) {
    return item.resourceId;
  }
  return item.requestPath || '-';
}

function formatDetail(item) {
  if (!item) {
    return '-';
  }
  return item.detail || item.errorMessage || item.summary || '-';
}

function normalizeListResponse(response) {
  const payload = response?.data ?? response ?? {};
  const nested = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const list = Array.isArray(nested)
    ? nested
    : nested.list || nested.records || nested.items || nested.rows || [];
  const totalCount = Number(nested.total ?? nested.count ?? nested.totalCount ?? list.length) || 0;

  return { list, total: totalCount };
}

function buildPayload() {
  const keywordParts = [
    filters.keyword.trim(),
    filters.operatorKeyword.trim()
  ].filter(Boolean);

  return {
    page: filters.page,
    pageSize: filters.pageSize,
    keyword: keywordParts.join(' '),
    actionCode: filters.actionCode.trim(),
    requestId: filters.requestId.trim()
  };
}

async function loadOperationLogs() {
  loading.value = true;
  clearFeedback();
  try {
    const response = await getOperationLogs(buildPayload());
    const { list, total: totalCount } = normalizeListResponse(response);
    operationLogs.value = list;
    total.value = totalCount;
  } catch (error) {
    setFeedback('error', error.message);
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.page = 1;
  filters.keyword = '';
  filters.operatorKeyword = '';
  filters.actionCode = '';
  filters.requestId = '';
  loadOperationLogs();
}

function changePage(nextPage) {
  const page = Math.min(Math.max(nextPage, 1), totalPages.value);
  if (page !== filters.page) {
    filters.page = page;
    loadOperationLogs();
  }
}

onMounted(() => {
  loadOperationLogs();
});
</script>

<template>
  <div class="admin-page">
    <header class="admin-header">
      <div>
        <h1 class="page-title">操作审计</h1>
        <p class="page-subtitle">只记录管理员真正执行的操作，不记录单纯查看列表、详情或状态的请求。</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" @click="loadOperationLogs" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </header>

    <div v-if="feedback.text" class="message-bar" :class="feedback.type === 'error' ? 'message-error' : 'message-success'">
      {{ feedback.text }}
    </div>

    <section class="section-card">
      <div class="filter-row">
        <input v-model.trim="filters.keyword" class="field-input" placeholder="关键词" />
        <input v-model.trim="filters.operatorKeyword" class="field-input" placeholder="操作人" />
        <input v-model.trim="filters.actionCode" class="field-input" placeholder="动作编码" />
        <input v-model.trim="filters.requestId" class="field-input" placeholder="请求ID" />
        <button class="btn btn-secondary" @click="loadOperationLogs">查询</button>
        <button class="btn btn-secondary" @click="resetFilters">重置</button>
      </div>

      <div v-if="operationLogs.length" class="table-shell mt-4">
        <table class="data-table">
          <colgroup>
            <col style="width: 14%;" />
            <col style="width: 10%;" />
            <col style="width: 15%;" />
            <col style="width: 16%;" />
            <col style="width: 10%;" />
            <col style="width: 15%;" />
            <col style="width: 20%;" />
          </colgroup>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>动作</th>
              <th>对象</th>
              <th>结果</th>
              <th>请求ID / 追踪ID</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in operationLogs" :key="item.id || `${item.requestId}-${item.createdAt}`">
              <td class="table-muted text-nowrap">{{ formatDate(item.createdAt) }}</td>
              <td class="text-nowrap">
                <strong>{{ item.operatorUsername || '-' }}</strong>
                <div class="helper-text">{{ item.operatorRole || '-' }}</div>
              </td>
              <td class="text-break">
                <div>{{ item.actionName || '-' }}</div>
                <div class="helper-text">{{ item.actionCode || '-' }}</div>
              </td>
              <td class="table-muted text-break">{{ formatTarget(item) }}</td>
              <td class="table-muted text-nowrap">{{ formatResult(item) }}</td>
              <td class="table-muted text-break">
                <div style="font-size: 11px;">{{ item.requestId || '-' }}</div>
                <div class="helper-text" style="font-size: 11px;">{{ item.traceId || '-' }}</div>
              </td>
              <td class="table-muted text-break">
                <details v-if="formatDetail(item) && formatDetail(item) !== '-'">
                  <summary style="cursor: pointer; font-weight: 500; outline: none; list-style-position: inside;">
                    {{ item.summary || '详细日志' }}
                  </summary>
                  <div class="helper-text" style="margin-top: 8px; font-size: 11px; font-family: monospace; padding: 8px; background: rgba(0,0,0,0.02); border-radius: 4px; max-height: 200px; overflow-y: auto; word-break: break-all; white-space: pre-wrap;">
                    {{ formatDetail(item) }}
                  </div>
                </details>
                <div v-else>{{ item.summary || '-' }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state mt-4">暂无操作审计记录</div>

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
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 16px; }
.page-title { font-size: 28px; margin: 0; color: var(--text-main); font-weight: 600; }
.page-subtitle { margin: 8px 0 0; color: var(--text-muted); font-family: "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif; }
.section-card { background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 24px; }
.filter-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto auto; gap: 12px; }
.mt-4 { margin-top: 16px; }
.table-shell { border-radius: var(--radius-md); border: 1px solid var(--border-soft); background: var(--table-bg); overflow: auto; }
.data-table { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: left; }
.data-table th, .data-table td { padding: 12px 12px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
.data-table th { background: var(--table-header-bg); color: var(--text-muted); font-size: 12px; text-transform: uppercase; font-weight: 600; }
.data-table tbody tr:hover { background: var(--table-hover-bg); }
.table-muted { color: var(--text-muted); font-size: 13px; }
.text-nowrap { white-space: nowrap; }
.text-break { word-break: break-all; word-wrap: break-word; }
.empty-state { padding: 40px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-soft); border-radius: var(--radius-md); }
.pagination-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }

@media (max-width: 1100px) {
  .filter-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .admin-header { flex-direction: column; align-items: flex-start; }
  .filter-row { grid-template-columns: 1fr; }
  .pagination-bar { flex-direction: column; align-items: flex-start; }
}
</style>
