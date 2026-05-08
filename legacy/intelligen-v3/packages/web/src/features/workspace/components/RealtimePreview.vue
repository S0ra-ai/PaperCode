<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { renderReportMarkdown } from '@/shared/utils/report-markdown';

const props = defineProps({
  /** Array of { sectionIndex, sectionTitle, paragraphs, done } */
  sections: { type: Array, default: () => [] },
  /** Whether the generation is still streaming */
  streaming: { type: Boolean, default: false },
  /** Total number of sections expected */
  totalSections: { type: Number, default: 0 },
  /** Overall task progress 0–100 */
  progress: { type: Number, default: 0 },
});

const emit = defineEmits(['close', 'rewrite-section']);

const contentEl = ref(null);
const activeSectionIndex = ref(-1);
const autoScroll = ref(true);

const completedCount = computed(() =>
  props.sections.filter((s) => s.done).length,
);

const progressLabel = computed(() => {
  if (!props.streaming && completedCount.value === props.totalSections && props.totalSections > 0) {
    return '生成完成';
  }
  if (props.totalSections > 0) {
    return `${completedCount.value} / ${props.totalSections} 章节`;
  }
  return '准备中...';
});

function scrollToSection(index) {
  activeSectionIndex.value = index;
  const el = contentEl.value?.querySelector(`[data-section="${index}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderedHtml(markdown) {
  try {
    return renderReportMarkdown(markdown);
  } catch {
    return markdown;
  }
}

watch(
  () => props.sections.length,
  async () => {
    if (!autoScroll.value) return;
    await nextTick();
    if (contentEl.value) {
      contentEl.value.scrollTop = contentEl.value.scrollHeight;
    }
    const last = props.sections[props.sections.length - 1];
    if (last) {
      activeSectionIndex.value = last.sectionIndex;
    }
  },
);

function handleScroll() {
  if (!contentEl.value) return;
  const { scrollTop, scrollHeight, clientHeight } = contentEl.value;
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 80;
}

function handleSectionClick(section) {
  if (!section.done) return;
  const fullText = (section.paragraphs || []).join('\n\n');
  emit('rewrite-section', {
    sectionIndex: section.sectionIndex,
    sectionTitle: section.sectionTitle,
    content: fullText,
  });
}
</script>

<template>
  <div class="realtime-preview">
    <!-- Header -->
    <div class="rtp-header">
      <div class="rtp-header-left">
        <svg class="rtp-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="rtp-title">实时预览</span>
        <span class="rtp-badge" :class="{ done: !streaming }">{{ progressLabel }}</span>
      </div>
      <button class="rtp-close" title="关闭预览" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Progress bar -->
    <div class="rtp-progress-track">
      <div class="rtp-progress-fill" :style="{ width: progress + '%' }" />
    </div>

    <div class="rtp-body">
      <!-- TOC Sidebar -->
      <nav class="rtp-toc" aria-label="章节目录">
        <div class="rtp-toc-title">目录</div>
        <ul>
          <li
            v-for="section in sections"
            :key="section.sectionIndex"
            class="rtp-toc-item"
            :class="{
              active: activeSectionIndex === section.sectionIndex,
              done: section.done,
              writing: !section.done && streaming,
            }"
            @click="scrollToSection(section.sectionIndex)"
          >
            <span class="rtp-toc-indicator">
              <svg v-if="section.done" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--color-success, #22c55e)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="streaming" class="rtp-dot-pulse" />
              <span v-else class="rtp-dot-idle" />
            </span>
            <span class="rtp-toc-label">{{ section.sectionTitle }}</span>
          </li>
        </ul>
        <div v-if="!sections.length" class="rtp-toc-empty">等待内容生成…</div>
      </nav>

      <!-- Content Area -->
      <div ref="contentEl" class="rtp-content" @scroll="handleScroll">
        <template v-for="section in sections" :key="section.sectionIndex">
          <div
            class="rtp-section"
            :class="{ 'rtp-section-clickable': section.done }"
            :data-section="section.sectionIndex"
          >
            <div
              v-for="(para, pi) in section.paragraphs"
              :key="pi"
              class="rtp-paragraph"
              :class="{ typing: !section.done && streaming && pi === section.paragraphs.length - 1 }"
              v-html="renderedHtml(para)"
            />
            <button
              v-if="section.done"
              class="rtp-rewrite-btn"
              title="重写此章节"
              @click.stop="handleSectionClick(section)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              重写
            </button>
          </div>
        </template>
        <div v-if="streaming && !sections.length" class="rtp-placeholder">
          <span class="rtp-dot-pulse" /> 正在生成内容，请稍候…
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.realtime-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--border-soft, #e5e7eb);
  border-radius: 24px;
  background: var(--surface, #fff);
  box-shadow: var(--shadow-card, 0 2px 8px rgba(0,0,0,.06));
  overflow: hidden;
}

/* Header */
.rtp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-soft, #e5e7eb);
}
.rtp-header-left { display: flex; align-items: center; gap: 8px; }
.rtp-icon { color: var(--text-secondary, #6b7280); }
.rtp-title { font-weight: 600; font-size: 15px; color: var(--text-primary, #111827); }
.rtp-badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-light, #eef2ff);
  color: var(--accent, #6366f1);
  font-weight: 500;
}
.rtp-badge.done { background: #ecfdf5; color: #059669; }
.rtp-close {
  background: none; border: none; cursor: pointer; padding: 4px;
  color: var(--text-secondary, #6b7280); border-radius: 8px;
  transition: background .15s;
}
.rtp-close:hover { background: var(--hover-bg, #f3f4f6); }

/* Progress */
.rtp-progress-track {
  height: 3px;
  background: var(--border-soft, #e5e7eb);
}
.rtp-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent, #6366f1), #818cf8);
  transition: width .4s ease;
  border-radius: 0 2px 2px 0;
}

/* Body */
.rtp-body { display: flex; flex: 1; min-height: 0; overflow: hidden; }

/* TOC */
.rtp-toc {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft, #e5e7eb);
  padding: 16px 12px;
  overflow-y: auto;
}
.rtp-toc-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, #9ca3af);
  margin-bottom: 10px;
}
.rtp-toc ul { list-style: none; margin: 0; padding: 0; }
.rtp-toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  transition: background .15s, color .15s;
}
.rtp-toc-item:hover { background: var(--hover-bg, #f3f4f6); }
.rtp-toc-item.active { background: var(--accent-light, #eef2ff); color: var(--accent, #6366f1); font-weight: 500; }
.rtp-toc-item.done { color: var(--text-primary, #111827); }
.rtp-toc-item.writing { color: var(--accent, #6366f1); }
.rtp-toc-indicator { display: flex; align-items: center; flex-shrink: 0; width: 16px; justify-content: center; }
.rtp-toc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rtp-toc-empty { font-size: 12px; color: var(--text-tertiary, #9ca3af); text-align: center; padding: 20px 0; }

/* Content */
.rtp-content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
  scroll-behavior: smooth;
}
.rtp-section { margin-bottom: 12px; position: relative; }
.rtp-section-clickable { cursor: default; }
.rtp-section-clickable:hover { background: var(--hover-bg, #f9fafb); border-radius: 8px; }

.rtp-rewrite-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-soft, #e5e7eb);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--accent, #6366f1);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.rtp-section:hover .rtp-rewrite-btn { opacity: 1; }
.rtp-rewrite-btn:hover { background: var(--accent-light, #eef2ff); }
.rtp-paragraph {
  margin-bottom: 8px;
  line-height: 1.75;
  font-size: 14.5px;
  color: var(--text-primary, #111827);
  animation: fadeInUp .35s ease both;
}
.rtp-paragraph :deep(h1),
.rtp-paragraph :deep(h2),
.rtp-paragraph :deep(h3) {
  margin-top: 1.2em;
  margin-bottom: .4em;
}

/* Typewriter cursor */
.rtp-paragraph.typing::after {
  content: '▌';
  display: inline;
  color: var(--accent, #6366f1);
  animation: blink-cursor .65s step-end infinite;
  font-weight: 300;
}

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Pulse dot */
.rtp-dot-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #6366f1);
  animation: pulse-dot 1.2s ease-in-out infinite;
}
.rtp-dot-idle {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-soft, #e5e7eb);
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: .6; }
  50% { transform: scale(1.4); opacity: 1; }
}

.rtp-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 40px 0;
  color: var(--text-tertiary, #9ca3af);
  font-size: 14px;
  justify-content: center;
}
</style>
