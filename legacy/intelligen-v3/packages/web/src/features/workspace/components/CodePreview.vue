<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  analysis: { type: Object, default: null },
  loading: { type: Boolean, default: false },
});

const expandedFiles = ref(new Set());

const languageColors = {
  Python: '#3776AB', Java: '#ED8B00', JavaScript: '#F7DF1E',
  TypeScript: '#3178C6', C: '#A8B9CC', 'C++': '#00599C',
  Go: '#00ADD8', Rust: '#DEA584',
};

const fileTree = computed(() => props.analysis?.code_analysis?.file_tree || []);
const languages = computed(() => props.analysis?.code_analysis?.languages || {});
const totalFiles = computed(() => props.analysis?.code_analysis?.total_files || 0);
const totalLines = computed(() => props.analysis?.code_analysis?.total_lines || 0);
const architecture = computed(() => props.analysis?.architecture || null);

function toggleFile(path) {
  if (expandedFiles.value.has(path)) {
    expandedFiles.value.delete(path);
  } else {
    expandedFiles.value.add(path);
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap = {
    py: '🐍', java: '☕', js: '📜', ts: '📘', tsx: '📘',
    jsx: '📜', c: '⚙️', cpp: '⚙️', h: '📎', hpp: '📎',
    go: '🔵', rs: '🦀', zip: '📦',
  };
  return iconMap[ext] || '📄';
}
</script>

<template>
  <div class="code-preview">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>分析代码中...</span>
    </div>

    <template v-else-if="analysis">
      <!-- Stats -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ totalFiles }}</span>
          <span class="stat-label">文件</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ totalLines.toLocaleString() }}</span>
          <span class="stat-label">行代码</span>
        </div>
        <div class="stat-item languages">
          <span
            v-for="(count, lang) in languages"
            :key="lang"
            class="lang-tag"
            :style="{ background: (languageColors[lang] || '#909399') + '22', color: languageColors[lang] || '#909399' }"
          >
            {{ lang }} ({{ count }})
          </span>
        </div>
      </div>

      <!-- Architecture Summary -->
      <div v-if="architecture" class="arch-section">
        <h4>架构分析</h4>
        <p v-if="architecture.project_summary" class="arch-summary">{{ architecture.project_summary }}</p>
        <div v-if="architecture.architecture_style" class="arch-meta">
          <span class="meta-label">架构风格:</span>
          <span class="meta-value">{{ architecture.architecture_style }}</span>
        </div>
        <div v-if="architecture.design_patterns?.length" class="arch-meta">
          <span class="meta-label">设计模式:</span>
          <span v-for="p in architecture.design_patterns" :key="p" class="pattern-tag">{{ p }}</span>
        </div>
        <div v-if="architecture.key_algorithms?.length" class="arch-meta">
          <span class="meta-label">关键算法:</span>
          <span v-for="a in architecture.key_algorithms" :key="a" class="pattern-tag">{{ a }}</span>
        </div>
        <div v-if="architecture.technologies?.length" class="arch-meta">
          <span class="meta-label">技术栈:</span>
          <span v-for="t in architecture.technologies" :key="t" class="tech-tag">{{ t }}</span>
        </div>
      </div>

      <!-- File Tree -->
      <div class="file-tree-section">
        <h4>文件结构 ({{ fileTree.length }})</h4>
        <div class="file-tree">
          <div
            v-for="path in fileTree.slice(0, 50)"
            :key="path"
            class="tree-item"
          >
            <span class="file-icon">{{ getFileIcon(path) }}</span>
            <span class="file-path">{{ path }}</span>
          </div>
          <div v-if="fileTree.length > 50" class="tree-more">
            ... 还有 {{ fileTree.length - 50 }} 个文件
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.code-preview { font-size: 13px; }
.loading-state {
  display: flex; align-items: center; gap: 8px;
  color: var(--text-muted); padding: 24px;
  justify-content: center;
}
.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--border-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.stats-bar {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 16px; background: var(--surface-strong);
  border-radius: 10px; margin-bottom: 16px;
}
.stat-item { display: flex; flex-direction: column; }
.stat-value { font-size: 18px; font-weight: 700; color: var(--text-main); }
.stat-label { font-size: 11px; color: var(--text-muted); }
.stat-item.languages {
  flex-direction: row; flex-wrap: wrap; gap: 6px;
  margin-left: auto;
}
.lang-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 8px;
  font-weight: 600;
}

.arch-section {
  background: var(--surface-strong); border-radius: 10px;
  padding: 16px; margin-bottom: 16px;
}
.arch-section h4 {
  margin: 0 0 8px; font-size: 14px; font-weight: 600;
  color: var(--text-main);
}
.arch-summary {
  font-size: 13px; color: var(--text-secondary);
  margin: 0 0 12px; line-height: 1.5;
}
.arch-meta {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 6px; margin-bottom: 6px;
}
.meta-label {
  font-size: 12px; font-weight: 500; color: var(--text-secondary);
}
.meta-value { font-size: 12px; color: var(--text-main); }
.pattern-tag, .tech-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 6px;
  background: var(--surface); color: var(--text-secondary);
}

.file-tree-section {
  background: var(--surface-strong); border-radius: 10px;
  padding: 16px;
}
.file-tree-section h4 {
  margin: 0 0 12px; font-size: 14px; font-weight: 600;
  color: var(--text-main);
}
.file-tree { max-height: 300px; overflow-y: auto; }
.tree-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; font-size: 12px;
}
.file-icon { flex-shrink: 0; }
.file-path { color: var(--text-secondary); word-break: break-all; }
.tree-more {
  font-size: 12px; color: var(--text-muted);
  padding: 8px 0; text-align: center;
}
</style>
