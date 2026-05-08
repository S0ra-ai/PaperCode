<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { getTemplates } from '@/features/templates/api/templates';

const props = defineProps({
  modelValue: { type: Object, default: null },
});

const emit = defineEmits(['update:modelValue']);

const visible = ref(false);
const loading = ref(false);
const keyword = ref('');
const templates = ref([]);

const typeLabels = {
  builtin: '内置', journal: '期刊', school: '学校', custom: '自定义',
};

async function fetchTemplates() {
  loading.value = true;
  try {
    const params = { pageSize: 50 };
    if (keyword.value) params.keyword = keyword.value;
    const res = await getTemplates(params);
    const data = res?.data || res;
    templates.value = data?.list || [];
  } catch (e) {
    console.error('Failed to load templates:', e);
  } finally {
    loading.value = false;
  }
}

function selectTemplate(tpl) {
  emit('update:modelValue', tpl);
  visible.value = false;
}

function clearSelection() {
  emit('update:modelValue', null);
}

function openSelector() {
  visible.value = true;
  fetchTemplates();
}

let debounceTimer = null;
watch(keyword, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchTemplates, 300);
});
</script>

<template>
  <div class="template-selector">
    <!-- Current Selection -->
    <div v-if="modelValue" class="selected-template" @click="openSelector">
      <div class="selected-info">
        <span class="selected-name">{{ modelValue.name }}</span>
        <span class="selected-type">{{ typeLabels[modelValue.type] || modelValue.type }}</span>
      </div>
      <button class="clear-btn" @click.stop="clearSelection" title="移除模板">✕</button>
    </div>

    <!-- Trigger Button -->
    <button v-else class="select-btn" @click="openSelector">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      选择模板
    </button>

    <!-- Dropdown Panel -->
    <div v-if="visible" class="selector-overlay" @click.self="visible = false">
      <div class="selector-panel">
        <div class="panel-header">
          <h4>选择模板</h4>
          <button class="close-btn" @click="visible = false">✕</button>
        </div>

        <div class="panel-search">
          <input v-model="keyword" class="search-input" placeholder="搜索模板..." />
        </div>

        <div class="panel-list">
          <div v-if="loading" class="panel-loading">加载中...</div>
          <div v-else-if="templates.length === 0" class="panel-empty">暂无可用模板</div>
          <div
            v-for="tpl in templates"
            :key="tpl.id"
            class="template-item"
            :class="{ selected: modelValue?.id === tpl.id }"
            @click="selectTemplate(tpl)"
          >
            <div class="item-name">{{ tpl.name }}</div>
            <div class="item-meta">
              <span class="item-type">{{ typeLabels[tpl.type] || tpl.type }}</span>
              <span v-if="tpl.school">{{ tpl.school }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-selector { position: relative; }
.select-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 8px;
  border: 1px dashed var(--border-soft); background: transparent;
  color: var(--text-secondary); font-size: 12px; cursor: pointer;
  transition: all 0.2s;
}
.select-btn:hover { border-color: var(--primary); color: var(--primary); }

.selected-template {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-radius: 8px;
  background: var(--surface-strong); border: 1px solid var(--primary);
  cursor: pointer; transition: all 0.2s;
}
.selected-info { flex: 1; }
.selected-name { font-size: 12px; font-weight: 500; color: var(--text-main); }
.selected-type { font-size: 10px; color: var(--text-muted); margin-left: 6px; }
.clear-btn {
  background: none; border: none; font-size: 14px;
  color: var(--text-muted); cursor: pointer; padding: 2px;
}
.clear-btn:hover { color: #F56C6C; }

.selector-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.selector-panel {
  background: var(--surface); border-radius: 12px;
  width: 440px; max-height: 500px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  display: flex; flex-direction: column;
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-soft);
}
.panel-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-main); }
.close-btn {
  background: none; border: none; font-size: 16px;
  color: var(--text-secondary); cursor: pointer;
}
.panel-search { padding: 12px 20px; }
.search-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border-soft);
  border-radius: 8px; background: var(--surface-strong);
  color: var(--text-main); font-size: 13px; outline: none;
  box-sizing: border-box;
}
.search-input:focus { border-color: var(--primary); }
.panel-list {
  flex: 1; overflow-y: auto; padding: 0 12px 12px;
}
.panel-loading, .panel-empty {
  text-align: center; padding: 24px;
  color: var(--text-muted); font-size: 13px;
}
.template-item {
  padding: 10px 12px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
  margin-bottom: 4px;
}
.template-item:hover { background: var(--surface-strong); }
.template-item.selected {
  background: rgba(var(--primary-rgb, 64, 158, 255), 0.08);
  border: 1px solid var(--primary);
}
.item-name { font-size: 13px; font-weight: 500; color: var(--text-main); }
.item-meta {
  display: flex; gap: 8px; margin-top: 2px;
  font-size: 11px; color: var(--text-muted);
}
.item-type { color: var(--primary); font-weight: 500; }
</style>
