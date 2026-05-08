<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  submitTemplateReview,
} from '@/features/templates/api/templates';
import TemplateCard from '@/features/templates/components/TemplateCard.vue';
import TemplateUpload from '@/features/templates/components/TemplateUpload.vue';
import TemplateDetail from '@/features/templates/components/TemplateDetail.vue';

// State
const activeTab = ref('my');
const loading = ref(false);
const templates = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');

const showUpload = ref(false);
const detailTemplate = ref(null);

const tabs = [
  { key: 'my', label: '我的模板', type: null },
  { key: 'builtin', label: '内置模板', type: 'builtin' },
  { key: 'journal', label: '期刊模板', type: 'journal' },
  { key: 'school', label: '学校模板', type: 'school' },
];

const currentTypeFilter = computed(() => {
  const tab = tabs.find(t => t.key === activeTab.value);
  return tab?.type || null;
});

async function fetchTemplates() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (currentTypeFilter.value) params.type = currentTypeFilter.value;
    if (keyword.value) params.keyword = keyword.value;

    const res = await getTemplates(params);
    const data = res?.data || res;
    templates.value = data?.list || [];
    total.value = data?.total || 0;
  } catch (e) {
    console.error('Failed to load templates:', e);
    templates.value = [];
  } finally {
    loading.value = false;
  }
}

function switchTab(key) {
  activeTab.value = key;
  page.value = 1;
  fetchTemplates();
}

function handleSearch() {
  page.value = 1;
  fetchTemplates();
}

async function handleCreateSubmit({ data }) {
  try {
    await createTemplate(data);
    showUpload.value = false;
    fetchTemplates();
  } catch (e) {
    console.error('Failed to create template:', e);
  }
}

async function handleDelete(tpl) {
  if (!confirm(`确定删除模板「${tpl.name}」？`)) return;
  try {
    await deleteTemplate(tpl.id);
    fetchTemplates();
  } catch (e) {
    console.error('Failed to delete template:', e);
  }
}

async function handleSubmitReview(tpl) {
  try {
    await submitTemplateReview(tpl.id);
    fetchTemplates();
  } catch (e) {
    console.error('Failed to submit for review:', e);
  }
}

function handleView(tpl) {
  detailTemplate.value = tpl;
}

function handleEdit(tpl) {
  detailTemplate.value = null;
  // Could navigate to edit page or open edit dialog
}

onMounted(fetchTemplates);
</script>

<template>
  <div class="template-manager">
    <div class="page-header">
      <h1 class="page-title">模板管理</h1>
      <div class="header-actions">
        <div class="search-box">
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索模板..."
            @keyup.enter="handleSearch"
          />
          <button class="search-btn" @click="handleSearch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </div>
        <button class="btn btn-primary" @click="showUpload = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新建模板
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="templates.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      <p>暂无模板</p>
      <button class="btn btn-primary" @click="showUpload = true">创建第一个模板</button>
    </div>

    <div v-else class="template-grid">
      <TemplateCard
        v-for="tpl in templates"
        :key="tpl.id"
        :template="tpl"
        @view="handleView"
        @edit="handleEdit"
        @delete="handleDelete"
        @submit-review="handleSubmitReview"
      />
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="pagination">
      <button
        class="page-btn"
        :disabled="page <= 1"
        @click="page--; fetchTemplates()"
      >上一页</button>
      <span class="page-info">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button
        class="page-btn"
        :disabled="page >= Math.ceil(total / pageSize)"
        @click="page++; fetchTemplates()"
      >下一页</button>
    </div>

    <!-- Upload Dialog -->
    <TemplateUpload
      v-if="showUpload"
      @submit="handleCreateSubmit"
      @cancel="showUpload = false"
    />

    <!-- Detail Dialog -->
    <TemplateDetail
      v-if="detailTemplate"
      :template="detailTemplate"
      @close="detailTemplate = null"
      @edit="handleEdit"
    />
  </div>
</template>

<style scoped>
.template-manager {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 8px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.search-box {
  display: flex;
  align-items: center;
  background: var(--surface-strong);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
}
.search-input {
  border: none;
  background: transparent;
  padding: 8px 12px;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  width: 200px;
}
.search-btn {
  background: none;
  border: none;
  padding: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}
.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
}
.btn-primary:hover { opacity: 0.9; }

.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 0;
}
.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  margin-bottom: -1px;
}
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-muted);
  gap: 12px;
}
.spinner {
  width: 24px; height: 24px;
  border: 2px solid var(--border-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding-bottom: 24px;
}
.page-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-main);
  font-size: 13px;
  cursor: pointer;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 13px; color: var(--text-secondary); }
</style>
