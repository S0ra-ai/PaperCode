<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  sections: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:sections', 'generate', 'cancel']);

const localSections = ref([]);
const collapsedSections = ref(new Set());
const editingIndex = ref(-1);
const editingTitle = ref('');
const dragIndex = ref(-1);
const dragOverIndex = ref(-1);

// Initialize from props
function initSections() {
  localSections.value = (props.sections || []).map((s, i) => ({
    ...s,
    id: s.id || `section-${i}`,
    title: s.title || `Section ${i + 1}`,
    description: s.description || '',
    subsections: s.subsections || [],
  }));
}

// Watch for external changes
watch(() => props.sections, initSections, { immediate: true, deep: true });

function toggleCollapse(index) {
  const id = localSections.value[index]?.id;
  if (collapsedSections.value.has(id)) {
    collapsedSections.value.delete(id);
  } else {
    collapsedSections.value.add(id);
  }
}

function isCollapsed(index) {
  return collapsedSections.value.has(localSections.value[index]?.id);
}

function startEdit(index) {
  editingIndex.value = index;
  editingTitle.value = localSections.value[index].title;
}

function confirmEdit(index) {
  if (editingTitle.value.trim()) {
    localSections.value[index].title = editingTitle.value.trim();
  }
  editingIndex.value = -1;
  emitUpdate();
}

function cancelEdit() {
  editingIndex.value = -1;
}

function addSection(afterIndex) {
  const newSection = {
    id: `section-new-${Date.now()}`,
    title: '新章节',
    description: '',
    subsections: [],
  };
  localSections.value.splice(afterIndex + 1, 0, newSection);
  emitUpdate();
  // Auto-start editing
  editingIndex.value = afterIndex + 1;
  editingTitle.value = newSection.title;
}

function removeSection(index) {
  if (localSections.value.length <= 1) return;
  localSections.value.splice(index, 1);
  emitUpdate();
}

function onDragStart(index) {
  dragIndex.value = index;
}

function onDragOver(e, index) {
  e.preventDefault();
  dragOverIndex.value = index;
}

function onDragDrop(index) {
  if (dragIndex.value < 0 || dragIndex.value === index) {
    dragIndex.value = -1;
    dragOverIndex.value = -1;
    return;
  }
  const item = localSections.value.splice(dragIndex.value, 1)[0];
  localSections.value.splice(index, 0, item);
  dragIndex.value = -1;
  dragOverIndex.value = -1;
  emitUpdate();
}

function onDragEnd() {
  dragIndex.value = -1;
  dragOverIndex.value = -1;
}

function emitUpdate() {
  emit('update:sections', [...localSections.value]);
}

function handleGenerate() {
  emit('generate', [...localSections.value]);
}
</script>

<template>
  <div class="outline-editor">
    <div class="outline-header">
      <h3 class="outline-title">📋 大纲预览与编辑</h3>
      <span class="section-count">{{ localSections.length }} 个章节</span>
    </div>

    <div class="outline-list">
      <div
        v-for="(section, index) in localSections"
        :key="section.id"
        class="outline-item"
        :class="{
          'is-dragging': dragIndex === index,
          'drag-over': dragOverIndex === index && dragIndex !== index,
          'is-collapsed': isCollapsed(index),
        }"
        :draggable="editingIndex !== index"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver($event, index)"
        @drop="onDragDrop(index)"
        @dragend="onDragEnd"
      >
        <div class="item-header">
          <span class="drag-handle" title="拖动排序">⠿</span>
          <span class="section-number">{{ index + 1 }}.</span>

          <template v-if="editingIndex === index">
            <input
              v-model="editingTitle"
              class="edit-input"
              @keyup.enter="confirmEdit(index)"
              @keyup.escape="cancelEdit"
              @blur="confirmEdit(index)"
              autofocus
            />
          </template>
          <template v-else>
            <span class="section-title" @dblclick="startEdit(index)">
              {{ section.title }}
            </span>
          </template>

          <div class="item-actions">
            <button class="icon-btn" @click="startEdit(index)" title="编辑标题">✏️</button>
            <button class="icon-btn" @click="toggleCollapse(index)" :title="isCollapsed(index) ? '展开' : '折叠'">
              {{ isCollapsed(index) ? '▶' : '▼' }}
            </button>
            <button class="icon-btn" @click="addSection(index)" title="在下方添加章节">➕</button>
            <button
              class="icon-btn danger"
              @click="removeSection(index)"
              :disabled="localSections.length <= 1"
              title="删除章节"
            >🗑️</button>
          </div>
        </div>

        <div v-if="!isCollapsed(index) && section.description" class="item-description">
          {{ section.description }}
        </div>

        <div v-if="!isCollapsed(index) && section.subsections?.length" class="item-subsections">
          <div v-for="(sub, si) in section.subsections" :key="si" class="subsection-item">
            • {{ sub }}
          </div>
        </div>
      </div>
    </div>

    <div class="outline-actions">
      <button class="btn-secondary" @click="$emit('cancel')">取消</button>
      <button class="btn-primary" @click="handleGenerate" :disabled="loading || localSections.length === 0">
        <span v-if="loading" class="spinner"></span>
        {{ loading ? '生成中...' : '确认并开始生成' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.outline-editor {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.outline-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #f0f0f0);
  margin: 0;
}

.section-count {
  font-size: 13px;
  color: var(--text-secondary, #888);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 10px;
  border-radius: 20px;
}

.outline-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.outline-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-md, 8px);
  padding: 10px 14px;
  cursor: grab;
  transition: all 0.2s ease;
}

.outline-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(0, 112, 243, 0.3);
}

.outline-item.is-dragging {
  opacity: 0.4;
}

.outline-item.drag-over {
  border-color: var(--primary, #0070F3);
  box-shadow: 0 0 0 2px rgba(0, 112, 243, 0.15);
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drag-handle {
  cursor: grab;
  color: var(--text-secondary, #666);
  font-size: 14px;
  user-select: none;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.outline-item:hover .drag-handle {
  opacity: 1;
}

.section-number {
  font-weight: 600;
  color: var(--primary, #0070F3);
  font-size: 14px;
  min-width: 24px;
}

.section-title {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary, #f0f0f0);
  cursor: text;
}

.edit-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--primary, #0070F3);
  border-radius: 4px;
  color: var(--text-primary, #f0f0f0);
  padding: 4px 8px;
  font-size: 14px;
  outline: none;
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.outline-item:hover .item-actions {
  opacity: 1;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.15s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.item-description {
  margin-top: 6px;
  padding-left: 46px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  line-height: 1.5;
}

.item-subsections {
  margin-top: 6px;
  padding-left: 46px;
}

.subsection-item {
  font-size: 12px;
  color: var(--text-secondary, #999);
  padding: 2px 0;
}

.outline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn-primary {
  background: var(--primary, #0070F3);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--secondary, #0056B3);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary, #f0f0f0);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 20px;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
