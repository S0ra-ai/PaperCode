<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { renderReportMarkdown } from '@/shared/utils/report-markdown';

const props = defineProps({
  markdown: { type: String, default: '' },
  canDownload: { type: Boolean, default: false },
  downloadStates: {
    type: Object,
    default: () => ({ docx: false, pdf: false, md: false, latex: false })
  },
  overlayTarget: {
    type: null,
    default: null
  }
});

const emit = defineEmits(['download']);

const activeView = ref('report');
const expanded = ref(false);
const copyState = ref('idle');

const hasMarkdown = computed(() => Boolean(props.markdown?.trim()));
const renderedHtml = computed(() => renderReportMarkdown(props.markdown));
const hasOverlayTarget = computed(() => Boolean(props.overlayTarget));

const parsedSections = computed(() => {
  if (!hasMarkdown.value) return [];
  const raw = props.markdown;
  const parts = raw.split(/(?=^# )/m).filter((s) => s.trim());
  return parts.map((content, index) => ({
    index,
    markdown: content,
    html: renderReportMarkdown(content)
  }));
});

const sectionCopyState = ref({});

function handleGlobalKeydown(event) {
  if (event.key === 'Escape') {
    expanded.value = false;
  }
}

watch(
  () => props.markdown,
  () => {
    copyState.value = 'idle';
  }
);

watch(expanded, (value) => {
  if (value) {
    window.addEventListener('keydown', handleGlobalKeydown);
  } else {
    window.removeEventListener('keydown', handleGlobalKeydown);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

async function handleCopy() {
  if (!hasMarkdown.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.markdown);
    copyState.value = 'done';
    window.setTimeout(() => {
      copyState.value = 'idle';
    }, 2000);
  } catch {
    copyState.value = 'failed';
    window.setTimeout(() => {
      copyState.value = 'idle';
    }, 2000);
  }
}

function openExpanded() {
  if (!hasOverlayTarget.value) {
    return;
  }
  expanded.value = true;
}

function closeExpanded() {
  expanded.value = false;
}

async function handleSectionCopy(sectionIndex, sectionMarkdown) {
  try {
    await navigator.clipboard.writeText(sectionMarkdown);
    sectionCopyState.value = { ...sectionCopyState.value, [sectionIndex]: 'done' };
    window.setTimeout(() => {
      sectionCopyState.value = { ...sectionCopyState.value, [sectionIndex]: 'idle' };
    }, 2000);
  } catch {
    sectionCopyState.value = { ...sectionCopyState.value, [sectionIndex]: 'failed' };
    window.setTimeout(() => {
      sectionCopyState.value = { ...sectionCopyState.value, [sectionIndex]: 'idle' };
    }, 2000);
  }
}
</script>

<template>
  <section class="report-viewer">
    <header class="report-toolbar">
      <div class="report-tabs" role="tablist" aria-label="报告视图模式">
        <button
          class="report-tab"
          :class="{ 'report-tab-active': activeView === 'report' }"
          type="button"
          @click="activeView = 'report'"
        >
          深度报告
        </button>
        <button
          class="report-tab"
          :class="{ 'report-tab-active': activeView === 'markdown' }"
          type="button"
          @click="activeView = 'markdown'"
        >
          底层文本（MD）
        </button>
      </div>

      <div class="report-actions">
        <button
          class="btn btn-secondary btn-mini"
          type="button"
          :disabled="!canDownload || downloadStates.docx"
          @click="emit('download', 'docx')"
        >
          {{ downloadStates.docx ? '导出 DOCX 中...' : '下载 DOCX 格式' }}
        </button>
        <button
          class="btn btn-ghost btn-mini"
          type="button"
          :disabled="!canDownload || downloadStates.pdf"
          @click="emit('download', 'pdf')"
        >
          {{ downloadStates.pdf ? '导出 PDF 中...' : '下载 PDF 格式' }}
        </button>
        <button
          class="btn btn-ghost btn-mini"
          type="button"
          :disabled="!canDownload || downloadStates.md"
          @click="emit('download', 'md')"
        >
          {{ downloadStates.md ? '打包 MD 中...' : '下载 MD 源码' }}
        </button>
        <button
          class="btn btn-ghost btn-mini"
          type="button"
          :disabled="!canDownload || downloadStates.latex"
          @click="emit('download', 'latex')"
        >
          {{ downloadStates.latex ? '导出 LaTeX 中...' : '下载 LaTeX' }}
        </button>
        <button class="btn btn-ghost btn-mini" type="button" @click="handleCopy">
          {{
            copyState === 'done'
              ? '已复制内容'
              : copyState === 'failed'
                ? '复制失败'
                : '复制内容'
          }}
        </button>
        <button v-if="hasOverlayTarget" class="btn btn-secondary btn-mini" type="button" @click="openExpanded">
          全屏预览
        </button>
      </div>
    </header>

    <div v-if="!hasMarkdown" class="report-empty">
      <strong>报告生成完成后会在这里呈现。</strong>
      <p>这里会显示排版后的正式报告，也可以切换到底层 Markdown 视图查看原始内容。</p>
    </div>

    <template v-else-if="activeView === 'report'">
      <div class="report-prose">
        <div
          v-for="section in parsedSections"
          :key="section.index"
          class="report-section"
        >
          <div class="report-section-actions">
            <button
              class="report-section-copy-btn"
              type="button"
              :title="sectionCopyState[section.index] === 'done' ? '已复制!' : '复制此章节'"
              @click="handleSectionCopy(section.index, section.markdown)"
            >
              <svg v-if="sectionCopyState[section.index] === 'done'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            </button>
          </div>
          <div v-html="section.html"></div>
        </div>
      </div>
    </template>

    <pre v-else class="report-raw">{{ markdown }}</pre>
  </section>

  <Teleport v-if="expanded && hasOverlayTarget" :to="overlayTarget">
    <div class="report-frame-overlay">
      <div class="report-frame-backdrop" @click="closeExpanded"></div>

      <section class="report-viewer report-viewer-expanded" @click.stop>
        <header class="report-toolbar report-toolbar-expanded">
          <div class="report-tabs" role="tablist" aria-label="报告视图模式">
            <button
              class="report-tab"
              :class="{ 'report-tab-active': activeView === 'report' }"
              type="button"
              @click="activeView = 'report'"
            >
              深度报告
            </button>
            <button
              class="report-tab"
              :class="{ 'report-tab-active': activeView === 'markdown' }"
              type="button"
              @click="activeView = 'markdown'"
            >
              底层文本（MD）
            </button>
          </div>

          <div class="report-actions">
            <button
              class="btn btn-secondary btn-mini"
              type="button"
              :disabled="!canDownload || downloadStates.docx"
              @click="emit('download', 'docx')"
            >
              {{ downloadStates.docx ? '导出 DOCX 中...' : '下载 DOCX 格式' }}
            </button>
            <button
              class="btn btn-ghost btn-mini"
              type="button"
              :disabled="!canDownload || downloadStates.pdf"
              @click="emit('download', 'pdf')"
            >
              {{ downloadStates.pdf ? '导出 PDF 中...' : '下载 PDF 格式' }}
            </button>
            <button
              class="btn btn-ghost btn-mini"
              type="button"
              :disabled="!canDownload || downloadStates.md"
              @click="emit('download', 'md')"
            >
              {{ downloadStates.md ? '打包 MD 中...' : '下载 MD 源码' }}
            </button>
            <button
              class="btn btn-ghost btn-mini"
              type="button"
              :disabled="!canDownload || downloadStates.latex"
              @click="emit('download', 'latex')"
            >
              {{ downloadStates.latex ? '导出 LaTeX 中...' : '下载 LaTeX' }}
            </button>
            <button class="btn btn-ghost btn-mini" type="button" @click="handleCopy">
              {{
                copyState === 'done'
                  ? '已复制内容'
                  : copyState === 'failed'
                    ? '复制失败'
                    : '复制内容'
              }}
            </button>
            <button class="btn btn-secondary btn-mini" type="button" @click="closeExpanded">
              退出全屏预览
            </button>
          </div>
        </header>

        <div v-if="!hasMarkdown" class="report-empty report-empty-expanded">
          <strong>报告生成完成后会在这里呈现。</strong>
          <p>这里会显示排版后的正式报告，也可以切换到底层 Markdown 视图查看原始内容。</p>
        </div>

        <template v-else-if="activeView === 'report'">
          <div class="report-prose report-prose-expanded">
            <div
              v-for="section in parsedSections"
              :key="section.index"
              class="report-section"
            >
              <div class="report-section-actions">
                <button
                  class="report-section-copy-btn"
                  type="button"
                  :title="sectionCopyState[section.index] === 'done' ? '已复制!' : '复制此章节'"
                  @click="handleSectionCopy(section.index, section.markdown)"
                >
                  <svg v-if="sectionCopyState[section.index] === 'done'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
                </button>
              </div>
              <div v-html="section.html"></div>
            </div>
          </div>
        </template>

        <pre v-else class="report-raw report-raw-expanded">{{ markdown }}</pre>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.report-viewer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  border-radius: 24px;
  background: var(--report-bg);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  padding: 18px;
  color: var(--text-main);
}

.report-frame-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  padding: 22px;
  pointer-events: auto;
}

.report-frame-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(4px);
}

.report-viewer-expanded {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 28px 32px 24px;
  gap: 18px;
  border-radius: 30px;
  background: var(--report-bg);
  border: 1px solid var(--border-soft);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.report-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.report-toolbar-expanded {
  flex: 0 0 auto;
}

.report-tabs {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface-muted);
}

.report-tab {
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 160ms ease;
}

.report-tab-active {
  background: var(--surface-elevated);
  color: var(--text-main);
  box-shadow: var(--shadow-card);
}

.report-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.report-empty {
  border-radius: 20px;
  padding: 24px;
  background: var(--surface-strong);
  border: 1px dashed var(--border-soft);
}

.report-empty-expanded {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.report-empty strong {
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
  color: var(--text-main);
}

.report-empty p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.7;
}

.report-prose {
  padding: 12px 4px 4px;
  max-height: 700px;
  overflow-y: auto;
}

/* 报告区域滚动条：中性灰，深浅模式下均清晰 */
.report-prose::-webkit-scrollbar {
  width: 6px;
}
.report-prose::-webkit-scrollbar-track {
  background: transparent;
}
.report-prose::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.45);
  border-radius: 3px;
}
.report-prose::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.7);
}

.report-prose-expanded {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  padding: 8px 4px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.report-prose-expanded > .report-section {
  max-width: 800px;
  width: 100%;
}

.report-prose-expanded :deep(p),
.report-prose-expanded :deep(li),
.report-prose-expanded :deep(blockquote) {
  font-size: 16px;
  line-height: 1.8;
}

.report-raw {
  margin: 0;
  padding: 20px;
  border-radius: 20px;
  background: var(--surface-strong);
  color: var(--text-main);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow: auto;
}

.report-raw-expanded {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}

.report-prose :deep(h1),
.report-prose :deep(h2),
.report-prose :deep(h3),
.report-prose :deep(h4) {
  color: var(--text-main);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.report-prose :deep(h1) {
  margin: 0 0 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-soft);
  font-size: clamp(30px, 3vw, 38px);
}

.report-prose :deep(h2) {
  margin: 34px 0 16px;
  font-size: clamp(22px, 2vw, 28px);
}

.report-prose :deep(h3) {
  margin: 22px 0 12px;
  font-size: 20px;
}

.report-prose :deep(p),
.report-prose :deep(li),
.report-prose :deep(blockquote) {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.9;
}

.report-prose :deep(p) {
  margin: 14px 0;
}

.report-prose :deep(ul),
.report-prose :deep(ol) {
  margin: 12px 0 18px 22px;
  padding: 0;
}

.report-prose :deep(ul ul),
.report-prose :deep(ul ol),
.report-prose :deep(ol ul),
.report-prose :deep(ol ol) {
  margin: 8px 0 12px 20px;
}

.report-prose :deep(li + li) {
  margin-top: 8px;
}

.report-prose :deep(li > p) {
  margin: 0;
}

.report-prose :deep(blockquote) {
  margin: 22px 0;
  padding: 16px 18px;
  border-left: 4px solid var(--primary);
  background: var(--surface-muted);
  border-radius: 0 16px 16px 0;
}

.report-prose :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-soft);
  margin: 28px 0;
}

.report-prose :deep(code) {
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-main);
  font-size: 0.92em;
}

.report-prose :deep(pre) {
  margin: 18px 0;
  padding: 16px;
  overflow: auto;
  border-radius: 18px;
  background: var(--surface-strong);
  color: var(--text-main);
  border: 1px solid var(--border-soft);
}

.report-prose :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}

.report-prose :deep(table) {
  width: 100%;
  margin: 22px 0;
  border-collapse: collapse;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border-soft);
}

.report-prose :deep(thead) {
  background: var(--surface-muted);
}

.report-prose :deep(th),
.report-prose :deep(td) {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
  font-size: 14px;
  line-height: 1.6;
}

.report-prose :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.report-prose :deep(a:hover) {
  color: var(--primary-strong);
  text-decoration: underline;
}

.report-prose :deep(.katex) {
  font-size: 1.04em;
  color: var(--text-main);
}

.report-prose :deep(.katex-display) {
  margin: 1.2rem 0;
  padding: 14px 16px;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 18px;
  background: var(--surface-muted);
  border: 1px solid var(--border-soft);
}

.report-prose :deep(.katex-display > .katex) {
  display: inline-block;
  min-width: 100%;
}

.report-prose :deep(.report-math-fallback) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-main);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.92em;
}

@media (max-width: 900px) {
  .report-frame-overlay {
    padding: 10px;
  }

  .report-viewer-expanded {
    padding: 18px;
    border-radius: 22px;
  }

  .report-toolbar {
    align-items: stretch;
  }

  .report-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

.report-section {
  position: relative;
}

.report-section-actions {
  position: absolute;
  top: 4px;
  right: 0;
  z-index: 5;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.report-section:hover .report-section-actions {
  opacity: 1;
}

.report-section-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-elevated);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 160ms ease;
}

.report-section-copy-btn:hover {
  color: var(--text-main);
  border-color: var(--primary);
}
</style>
