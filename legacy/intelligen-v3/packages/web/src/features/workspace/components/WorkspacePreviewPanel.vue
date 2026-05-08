<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { getFileDetail } from '@/features/workspace/api/file';
import { downloadTaskReport, regenerateSection } from '@/features/workspace/api/task';
import { parseReportEvidence, renderEvidenceSectionHtml } from '@/shared/utils/report-evidence';
import { renderReportMarkdown } from '@/shared/utils/report-markdown';

const props = defineProps({
  preview: { type: Object, default: null },
  downloadStates: {
    type: Object,
    default: () => ({ docx: false, pdf: false, md: false, latex: false })
  }
});

const emit = defineEmits(['close', 'download', 'update:markdown']);

let docxLoaderPromise = null;
let previewRequestToken = 0;

function loadDocxPreviewRenderer() {
  if (docxLoaderPromise) {
    return docxLoaderPromise;
  }

  docxLoaderPromise = import('docx-preview')
    .then((module) => {
      const renderer = module?.renderAsync
        ? module
        : module?.default?.renderAsync
          ? module.default
          : null;
      if (!renderer?.renderAsync) {
        throw new Error('DOCX renderer unavailable');
      }
      return renderer;
    })
    .catch((error) => {
      docxLoaderPromise = null;
      throw error;
    });

  return docxLoaderPromise;
}

function inferFileType(fileType, fileName = '') {
  const normalizedType = String(fileType || '').trim().toLowerCase();
  if (normalizedType) {
    if (normalizedType.includes('wordprocessingml.document')) {
      return 'docx';
    }
    if (normalizedType.includes('/')) {
      const mime = normalizedType.split('/').at(-1);
      if (mime === 'plain') {
        return 'txt';
      }
      return mime;
    }
    return normalizedType.replace(/^\./, '');
  }

  const extensionMatch = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return extensionMatch?.[1] || '';
}

async function renderDocxBlob(blob, container) {
  if (!blob || !container) {
    return;
  }

  const renderer = await loadDocxPreviewRenderer();
  const arrayBuffer = await blob.arrayBuffer();
  container.innerHTML = '';
  await renderer.renderAsync(arrayBuffer, container, null, {
    inWrapper: true,
    className: 'docx-preview-document',
    useBase64URL: true,
    ignoreLastRenderedPageBreak: true
  });
}

const fileDetail = ref(null);
const fileContent = ref('');
const fileError = ref('');
const reportError = ref('');
const loading = ref(false);
const fileDocxContainer = ref(null);
const reportDocxContainer = ref(null);
const reportPdfUrl = ref('');
const markdownEditMode = ref(false);
const evidenceMode = ref(false);
const selectedCitationNumber = ref(null);
const evidenceSelectionContext = ref(null);
const evidenceReferencesSectionRef = ref(null);
const evidenceSectionRefs = ref({});
const regeneratingIndex = ref(-1);
const regenDialogVisible = ref(false);
const regenDialogIndex = ref(-1);
const regenCustomPrompt = ref('');

const canRegenerate = computed(() =>
  isReportReady.value && Boolean(props.preview?.markdown?.trim())
);

const parsedSections = computed(() => {
  const md = props.preview?.markdown || '';
  if (!md.trim()) return [];
  return md.split(/(?=^# )/m).filter(s => s.trim());
});

const isReportPreview = computed(() => props.preview?.kind === 'report');
const reportStatus = computed(() => String(props.preview?.status || '').toLowerCase());
const isReportReady = computed(() =>
  isReportPreview.value
  && reportStatus.value === 'completed'
  && Boolean(props.preview?.taskId)
);
const hasPaperPdfArtifact = computed(() => Boolean(props.preview?.artifactPaths?.pdf_path));
const hasReportMarkdown = computed(() => Boolean(props.preview?.markdown?.trim()));
const canShowEvidence = computed(() => isReportPreview.value && hasReportMarkdown.value);
const showEvidenceView = computed(() => evidenceMode.value && canShowEvidence.value);
const reportFallbackHtml = computed(() => {
  if (!reportError.value || !props.preview?.markdown?.trim()) return '';
  return renderReportMarkdown(props.preview?.markdown || '');
});
const showReportFallback = computed(() => Boolean(reportError.value && props.preview?.markdown?.trim()));
const loadingLabel = computed(() => (isReportPreview.value ? '正在渲染文档视图...' : '正在加载内容...'));
const reportEvidence = computed(() => {
  if (!showEvidenceView.value) return { sections: [], citationCounts: {} };
  return parseReportEvidence(props.preview?.markdown || '');
});
const evidenceSections = computed(() => reportEvidence.value.sections.map((section) => ({
  ...section,
  html: renderEvidenceSectionHtml(section.markdown, {
    sectionIndex: section.index,
    sectionTitle: section.heading,
    citationCounts: reportEvidence.value.citationCounts,
    activeCitationNumber: selectedCitationNumber.value
  })
})));
const selectedEvidence = computed(() =>
  reportEvidence.value.references.find((reference) => reference.number === selectedCitationNumber.value) || null
);
const evidenceSectionsWithCitations = computed(() =>
  reportEvidence.value.sections.filter((section) => section.citationMentions > 0).length
);

const mergedFile = computed(() => {
  if (props.preview?.kind !== 'file') {
    return null;
  }

  return {
    ...fileDetail.value,
    ...props.preview,
    fileUrl: props.preview?.fileUrl || fileDetail.value?.fileUrl || '',
    fileType: inferFileType(
      props.preview?.fileType || fileDetail.value?.fileType,
      props.preview?.fileName || fileDetail.value?.fileName
    ),
    fileName: props.preview?.fileName || fileDetail.value?.fileName || '未命名文件'
  };
});

const isDocxPreview = computed(() => mergedFile.value?.fileType === 'docx');
const isPdfPreview = computed(() => mergedFile.value?.fileType === 'pdf');
const isImagePreview = computed(() => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(mergedFile.value?.fileType || ''));
const isTextPreview = computed(() => ['txt', 'md', 'markdown', 'json', 'csv'].includes(mergedFile.value?.fileType || ''));

function resetPreviewState() {
  if (reportPdfUrl.value) {
    window.URL.revokeObjectURL(reportPdfUrl.value);
    reportPdfUrl.value = '';
  }
  fileDetail.value = null;
  fileContent.value = '';
  fileError.value = '';
  reportError.value = '';
  if (fileDocxContainer.value) {
    fileDocxContainer.value.innerHTML = '';
  }
  if (reportDocxContainer.value) {
    reportDocxContainer.value.innerHTML = '';
  }
}

async function loadReportPreview(currentToken) {
  if (!isReportReady.value) {
    return;
  }

  const format = hasPaperPdfArtifact.value ? 'pdf' : 'docx';
  const { blob } = await downloadTaskReport(props.preview.taskId, format);
  if (currentToken !== previewRequestToken) {
    return;
  }

  if (format === 'pdf') {
    reportPdfUrl.value = window.URL.createObjectURL(blob);
    return;
  }

  await nextTick();
  if (currentToken !== previewRequestToken || !reportDocxContainer.value) {
    return;
  }

  await renderDocxBlob(blob, reportDocxContainer.value);
}

async function loadFilePreview(currentToken) {
  if (props.preview?.fileId) {
    const response = await getFileDetail(props.preview.fileId);
    if (currentToken !== previewRequestToken) {
      return;
    }
    fileDetail.value = response.data;
  }

  await nextTick();
  const file = mergedFile.value;
  if (!file?.fileUrl) {
    throw new Error('当前文件缺少可预览地址');
  }

  if (isTextPreview.value) {
    const response = await globalThis.fetch(file.fileUrl);
    if (!response.ok) {
      throw new Error('文本文件加载失败');
    }
    const text = await response.text();
    if (currentToken !== previewRequestToken) {
      return;
    }
    fileContent.value = text;
    return;
  }

  if (isDocxPreview.value) {
    const response = await globalThis.fetch(file.fileUrl);
    if (!response.ok) {
      throw new Error('DOCX 文件加载失败');
    }
    const blob = await response.blob();
    if (currentToken !== previewRequestToken) {
      return;
    }

    await nextTick();
    if (currentToken !== previewRequestToken || !fileDocxContainer.value) {
      return;
    }

    await renderDocxBlob(blob, fileDocxContainer.value);
  }
}

async function loadPreview() {
  previewRequestToken += 1;
  const currentToken = previewRequestToken;
  resetPreviewState();

  if (!props.preview) {
    return;
  }

  loading.value = true;
  try {
    if (isReportPreview.value) {
      await loadReportPreview(currentToken);
    } else {
      await loadFilePreview(currentToken);
    }
  } catch (error) {
    if (currentToken !== previewRequestToken) {
      return;
    }

    if (isReportPreview.value) {
      reportError.value = error.message || '报告预览加载失败';
    } else {
      fileError.value = error.message || '文件预览失败';
    }
  } finally {
    if (currentToken === previewRequestToken) {
      loading.value = false;
    }
  }
}

function openRegenDialog(index) {
  regenDialogIndex.value = index;
  regenCustomPrompt.value = '';
  regenDialogVisible.value = true;
}

function closeRegenDialog() {
  regenDialogVisible.value = false;
  regenDialogIndex.value = -1;
  regenCustomPrompt.value = '';
}

async function handleRegenerate() {
  const index = regenDialogIndex.value;
  if (index < 0 || !props.preview?.taskId) return;
  closeRegenDialog();
  regeneratingIndex.value = index;
  try {
    const customPrompt = regenCustomPrompt.value.trim() || undefined;
    const res = await regenerateSection(props.preview.taskId, index, { customPrompt });
    const newMarkdown = res?.data?.fullMarkdown;
    if (newMarkdown) {
      emit('update:markdown', newMarkdown);
    }
  } catch (err) {
    reportError.value = err?.response?.data?.message || err.message || '章节重新生成失败';
  } finally {
    regeneratingIndex.value = -1;
  }
}

function toggleMarkdownEditMode() {
  if (!markdownEditMode.value) {
    evidenceMode.value = false;
  }
  markdownEditMode.value = !markdownEditMode.value;
}

function ensureEvidenceSelection(preferredCitationNumber = null) {
  const references = reportEvidence.value?.references;
  if (!references?.length) {
    selectedCitationNumber.value = null;
    return;
  }

  const preferredReference = preferredCitationNumber != null
    ? references.find((reference) => reference.number === Number(preferredCitationNumber))
    : null;
  const currentReference = references.find((reference) => reference.number === selectedCitationNumber.value);
  const nextCitationNumber = preferredReference?.number ?? currentReference?.number ?? references[0].number;
  if (nextCitationNumber !== selectedCitationNumber.value) {
    evidenceSelectionContext.value = null;
  }
  selectedCitationNumber.value = nextCitationNumber;
}

function toggleEvidenceMode() {
  if (!canShowEvidence.value) {
    return;
  }

  evidenceMode.value = !evidenceMode.value;
  if (evidenceMode.value) {
    markdownEditMode.value = false;
    ensureEvidenceSelection();
  } else {
    evidenceSelectionContext.value = null;
  }
}

function selectEvidence(number, context = null) {
  selectedCitationNumber.value = Number(number);
  evidenceSelectionContext.value = context;
}

function handleEvidenceCitationClick(event) {
  const trigger = event.target?.closest?.('[data-citation-number]');
  if (!trigger) {
    return;
  }

  const citationNumber = Number(trigger.dataset.citationNumber);
  if (!Number.isFinite(citationNumber)) {
    return;
  }

  selectEvidence(citationNumber, {
    sectionIndex: Number(trigger.dataset.citationSectionIndex),
    sectionTitle: trigger.dataset.citationSectionTitle || ''
  });
}

function setEvidenceSectionRef(index, element) {
  if (element) {
    evidenceSectionRefs.value[index] = element;
    return;
  }

  delete evidenceSectionRefs.value[index];
}

async function scrollToReferences() {
  await nextTick();
  evidenceReferencesSectionRef.value?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function scrollToEvidenceSection(sectionIndex) {
  await nextTick();
  evidenceSectionRefs.value[sectionIndex]?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function formatReferenceMeta(reference) {
  const sourceLine = [reference.source, reference.year].filter(Boolean).join(' · ');
  return [reference.authors, sourceLine].filter(Boolean).join(' · ') || '暂无结构化元数据';
}

function formatReferenceUsage(reference) {
  if (!reference?.usageCount) {
    return '正文中暂未检测到该引用。';
  }

  return reference.usageCount > 1
    ? `正文共引用 ${reference.usageCount} 次`
    : '正文共引用 1 次';
}

watch(
  () => props.preview,
  () => {
    loadPreview();
  },
  { deep: true, immediate: true }
);

watch(
  () => [props.preview?.kind, props.preview?.taskId, props.preview?.fileId],
  () => {
    markdownEditMode.value = false;
    evidenceMode.value = false;
    selectedCitationNumber.value = null;
    evidenceSelectionContext.value = null;
  }
);

watch(
  reportEvidence,
  () => {
    ensureEvidenceSelection();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  previewRequestToken += 1;
  if (reportPdfUrl.value) {
    window.URL.revokeObjectURL(reportPdfUrl.value);
  }
});
</script>

<template>
  <aside class="workspace-preview-panel" role="complementary" aria-label="文档预览面板">
    <header class="workspace-preview-head">
      <div class="workspace-preview-head-left">
        <button class="workspace-preview-icon-btn" type="button" @click="emit('close')" title="关闭预览" aria-label="关闭预览">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="workspace-preview-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <strong>{{ preview?.title || mergedFile?.fileName || '文档预览' }}</strong>
        </div>
      </div>

      <div class="workspace-preview-head-actions">
        <template v-if="isReportPreview">
          <button
            class="workspace-preview-action-btn"
            type="button"
            :disabled="!isReportReady || downloadStates.docx"
            @click="emit('download', 'docx')"
            title="下载 Word 文档"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Word
          </button>
          <button
            class="workspace-preview-action-btn"
            type="button"
            :disabled="!isReportReady || downloadStates.pdf"
            @click="emit('download', 'pdf')"
            title="下载 PDF 文档"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            PDF
          </button>
          <button
            class="workspace-preview-action-btn"
            type="button"
            :disabled="!isReportReady || downloadStates.md"
            @click="emit('download', 'md')"
            title="下载 Markdown 原文"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Markdown
          </button>
          <button
            class="workspace-preview-action-btn"
            type="button"
            :disabled="!isReportReady || downloadStates.latex"
            @click="emit('download', 'latex')"
            title="下载 LaTeX (.tex + .bib)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            LaTeX
          </button>
          <button
            v-if="canShowEvidence"
            class="workspace-preview-action-btn"
            :class="{ active: showEvidenceView }"
            type="button"
            @click="toggleEvidenceMode"
            title="切换引用证据视图"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6"></path><path d="M12 9v6"></path><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"></path><path d="M14 3v5h5"></path></svg>
            {{ showEvidenceView ? '关闭证据' : '证据视图' }}
          </button>
          <button
            v-if="canRegenerate"
            class="workspace-preview-action-btn"
            :class="{ active: markdownEditMode }"
            type="button"
            @click="toggleMarkdownEditMode"
            title="切换章节编辑模式"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            {{ markdownEditMode ? '退出编辑' : '编辑章节' }}
          </button>
        </template>
        <template v-else-if="mergedFile?.fileUrl">
          <a class="workspace-preview-action-btn" :href="mergedFile.fileUrl" target="_blank" rel="noopener noreferrer" title="在新标签页中打开">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            新窗口
          </a>
        </template>
      </div>
    </header>

    <div class="workspace-preview-body" :class="{ 'workspace-preview-body-file': !isReportPreview }">
      <template v-if="isReportPreview">
        <div v-if="showEvidenceView" class="workspace-preview-evidence-layout">
          <section class="workspace-preview-evidence-main">
            <div class="workspace-preview-evidence-summary">
              <div class="workspace-preview-evidence-stat">
                <strong>{{ reportEvidence.references.length }}</strong>
                <span>条参考来源</span>
              </div>
              <div class="workspace-preview-evidence-stat">
                <strong>{{ reportEvidence.totalCitationMentions }}</strong>
                <span>次正文引用</span>
              </div>
              <div class="workspace-preview-evidence-stat">
                <strong>{{ evidenceSectionsWithCitations }}</strong>
                <span>个章节含引用</span>
              </div>
            </div>

            <div class="workspace-preview-evidence-scroll">
              <div
                v-for="section in evidenceSections"
                :key="section.index"
                :ref="(element) => setEvidenceSectionRef(section.index, element)"
                class="workspace-preview-section-card"
              >
                <div class="workspace-preview-section-header workspace-preview-evidence-section-header">
                  <div class="workspace-preview-evidence-section-heading">
                    <span class="workspace-preview-section-badge">章节 {{ section.index + 1 }}</span>
                    <strong>{{ section.heading }}</strong>
                  </div>
                  <span class="workspace-preview-evidence-section-count">
                    {{ section.citationMentions ? `${section.citationMentions} 处引用` : '暂无引用' }}
                  </span>
                </div>
                <div
                  class="workspace-preview-section-content workspace-preview-report-prose"
                  @click="handleEvidenceCitationClick"
                  v-html="section.html"
                ></div>
              </div>

              <section
                ref="evidenceReferencesSectionRef"
                class="workspace-preview-section-card workspace-preview-evidence-references"
              >
                <div class="workspace-preview-section-header workspace-preview-evidence-section-header">
                  <div class="workspace-preview-evidence-section-heading">
                    <span class="workspace-preview-section-badge">参考来源</span>
                    <strong>{{ reportEvidence.referencesHeading || '参考文献' }}</strong>
                  </div>
                  <span class="workspace-preview-evidence-section-count">{{ reportEvidence.references.length }} 条</span>
                </div>

                <div v-if="reportEvidence.references.length" class="workspace-preview-evidence-reference-list">
                  <button
                    v-for="reference in reportEvidence.references"
                    :key="reference.number"
                    class="workspace-preview-reference-card"
                    :class="{ active: selectedCitationNumber === reference.number }"
                    type="button"
                    @click="selectEvidence(reference.number)"
                  >
                    <div class="workspace-preview-reference-card-head">
                      <span class="workspace-preview-reference-number">[{{ reference.number }}]</span>
                      <span v-if="reference.usageCount" class="workspace-preview-reference-count">
                        {{ reference.repeated ? `×${reference.usageCount}` : '已引用' }}
                      </span>
                    </div>
                    <strong>{{ reference.title }}</strong>
                    <p>{{ formatReferenceMeta(reference) }}</p>
                  </button>
                </div>
                <div v-else class="workspace-preview-note">
                  <strong>尚未解析到参考来源</strong>
                  <p>当前报告正文暂无受信引用，或参考文献章节尚未生成。</p>
                </div>
              </section>
            </div>
          </section>

          <aside class="workspace-preview-evidence-panel">
            <div v-if="selectedEvidence" class="workspace-preview-evidence-card">
              <div class="workspace-preview-evidence-card-head">
                <span class="workspace-preview-reference-number">[{{ selectedEvidence.number }}]</span>
                <span class="workspace-preview-reference-count">
                  {{ formatReferenceUsage(selectedEvidence) }}
                </span>
              </div>
              <h3>{{ selectedEvidence.title }}</h3>

              <div v-if="evidenceSelectionContext?.sectionTitle" class="workspace-preview-evidence-context">
                <span>点击位置</span>
                <strong>{{ evidenceSelectionContext.sectionTitle }}</strong>
              </div>

              <dl class="workspace-preview-evidence-meta">
                <div v-if="selectedEvidence.authors">
                  <dt>作者</dt>
                  <dd>{{ selectedEvidence.authors }}</dd>
                </div>
                <div v-if="selectedEvidence.source">
                  <dt>来源</dt>
                  <dd>{{ selectedEvidence.source }}</dd>
                </div>
                <div v-if="selectedEvidence.year">
                  <dt>年份</dt>
                  <dd>{{ selectedEvidence.year }}</dd>
                </div>
                <div v-if="selectedEvidence.url">
                  <dt>链接</dt>
                  <dd>
                    <a :href="selectedEvidence.url" target="_blank" rel="noopener noreferrer">
                      {{ selectedEvidence.url }}
                    </a>
                  </dd>
                </div>
              </dl>

              <div v-if="selectedEvidence.sectionUsages.length" class="workspace-preview-evidence-jumps">
                <span class="workspace-preview-evidence-label">正文出现位置</span>
                <div class="workspace-preview-evidence-jump-list">
                  <button
                    v-for="usage in selectedEvidence.sectionUsages"
                    :key="`${selectedEvidence.number}-${usage.index}`"
                    class="workspace-preview-evidence-jump-btn"
                    type="button"
                    @click="scrollToEvidenceSection(usage.index)"
                  >
                    {{ usage.heading }} · {{ usage.count }} 次
                  </button>
                </div>
              </div>

              <div class="workspace-preview-evidence-actions">
                <button class="workspace-preview-evidence-action-btn" type="button" @click="scrollToReferences">
                  定位到参考条目
                </button>
                <a
                  v-if="selectedEvidence.url"
                  class="workspace-preview-evidence-action-btn primary"
                  :href="selectedEvidence.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开原始来源
                </a>
              </div>

              <div v-if="selectedEvidence.missing" class="workspace-preview-note workspace-preview-note-warning">
                <strong>未解析到完整参考条目</strong>
                <p>正文中检测到了该引用编号，但参考文献章节里没有找到匹配条目。</p>
              </div>

              <p v-if="selectedEvidence.rawText" class="workspace-preview-evidence-raw">
                {{ selectedEvidence.rawText }}
              </p>
            </div>

            <div v-else class="workspace-preview-status">
              <strong>请选择一个引用编号</strong>
              <p>点击正文中的 [N] 标记，或从参考来源列表中选择一条记录。</p>
            </div>
          </aside>
        </div>

        <article v-else-if="showReportFallback" class="workspace-preview-report-fallback">
          <div class="workspace-preview-note workspace-preview-note-error">
            <strong>文档渲染失败，已降级为格式化文本视图</strong>
            <p>{{ reportError }}</p>
          </div>
          <div class="workspace-preview-report-prose" v-html="reportFallbackHtml"></div>
        </article>

        <div v-else-if="reportError" class="workspace-preview-status error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <strong>文档渲染暂时不可用</strong>
          <p>{{ reportError }}</p>
        </div>

        <div v-else-if="markdownEditMode && canRegenerate" class="workspace-preview-sections">
          <div
            v-for="(section, idx) in parsedSections"
            :key="idx"
            class="workspace-preview-section-card"
          >
            <div class="workspace-preview-section-header">
              <span class="workspace-preview-section-badge">章节 {{ idx + 1 }}</span>
              <button
                class="workspace-preview-section-regen-btn"
                type="button"
                :disabled="regeneratingIndex >= 0"
                @click="openRegenDialog(idx)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                {{ regeneratingIndex === idx ? '重新生成中...' : '重新生成' }}
              </button>
            </div>
            <div class="workspace-preview-section-content workspace-preview-report-prose" v-html="renderReportMarkdown(section)"></div>
          </div>

          <div v-if="regenDialogVisible" class="workspace-preview-regen-overlay" @click.self="closeRegenDialog">
            <div class="workspace-preview-regen-dialog">
              <h3>重新生成章节 {{ regenDialogIndex + 1 }}</h3>
              <p class="workspace-preview-regen-hint">可选：输入自定义提示词来引导章节重新生成</p>
              <textarea
                v-model="regenCustomPrompt"
                class="workspace-preview-regen-textarea"
                placeholder="例如：请增加更多数据分析内容..."
                rows="3"
              ></textarea>
              <div class="workspace-preview-regen-actions">
                <button class="workspace-preview-regen-cancel" type="button" @click="closeRegenDialog">取消</button>
                <button class="workspace-preview-regen-confirm" type="button" @click="handleRegenerate">确认重新生成</button>
              </div>
            </div>
          </div>
        </div>

        <iframe v-else-if="reportPdfUrl" class="workspace-preview-frame" :src="reportPdfUrl" title="Paper PDF preview"></iframe>
        <div v-else-if="isReportReady" ref="reportDocxContainer" class="workspace-preview-docx"></div>

        <div v-else class="workspace-preview-status">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <strong>报告正在生成中</strong>
          <p>任务完成后，这里会自动刷新显示为排版后的文档预览。</p>
        </div>
      </template>

      <template v-else>
        <div v-if="fileError" class="workspace-preview-status error">
          <strong>文件源不可用</strong>
          <p>{{ fileError }}</p>
        </div>

        <iframe v-else-if="isPdfPreview" class="workspace-preview-frame" :src="mergedFile?.fileUrl" title="PDF preview"></iframe>
        <div v-else-if="isImagePreview" class="workspace-preview-image-shell"><img class="workspace-preview-image" :src="mergedFile?.fileUrl" :alt="mergedFile?.fileName" /></div>
        <pre v-else-if="isTextPreview" class="workspace-preview-text">{{ fileContent }}</pre>
        <div v-else-if="isDocxPreview" ref="fileDocxContainer" class="workspace-preview-docx"></div>

        <div v-else class="workspace-preview-status">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          <strong>暂不支持在线预览此格式</strong>
          <p>请直接下载，或在新窗口中查看。</p>
        </div>
      </template>

      <div v-if="loading" class="workspace-preview-status workspace-preview-status-overlay">
        <div class="spinner"></div>
        <span>{{ loadingLabel }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.workspace-preview-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-muted);
  border-radius: 24px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.workspace-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-soft);
  z-index: 10;
}

.workspace-preview-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.workspace-preview-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.workspace-preview-title strong {
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.workspace-preview-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.workspace-preview-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.workspace-preview-action-btn:hover:not([disabled]) {
  background: var(--surface-strong);
  color: var(--text-main);
  border-color: var(--border-hover);
}

.workspace-preview-action-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--surface-muted);
}

.workspace-preview-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-preview-icon-btn:hover {
  background: var(--surface-strong);
  color: var(--text-main);
}

.workspace-preview-icon-btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

.workspace-preview-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--surface-muted);
}

.workspace-preview-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-muted);
  text-align: center;
}

.workspace-preview-status-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(248, 250, 252, 0.86);
  backdrop-filter: blur(2px);
}

.workspace-preview-status svg {
  color: var(--text-secondary);
  opacity: 0.5;
  margin-bottom: 8px;
}

.workspace-preview-status strong {
  color: var(--text-main);
  font-size: 15px;
  font-weight: 600;
}

.workspace-preview-status p {
  margin: 0;
  font-size: 13px;
  max-width: 280px;
  line-height: 1.6;
}

.workspace-preview-status.error svg {
  color: #f87171;
  opacity: 1;
}

.workspace-preview-status.error strong {
  color: #f87171;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.workspace-preview-frame,
.workspace-preview-text,
.workspace-preview-image-shell,
.workspace-preview-report-fallback {
  width: 100%;
  height: 100%;
}

.workspace-preview-frame {
  border: none;
  background: white;
}

.workspace-preview-image-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.workspace-preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}

.workspace-preview-text {
  margin: 0;
  padding: 24px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--text-main);
  line-height: 1.7;
  font-family: monospace;
  font-size: 13px;
}

.workspace-preview-report-fallback {
  overflow: auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: var(--surface);
}

.workspace-preview-note {
  padding: 16px 20px;
  border-radius: 16px;
  border: 1px solid var(--border-soft);
  background: var(--surface-muted);
}

.workspace-preview-note strong {
  display: block;
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
}

.workspace-preview-note p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.workspace-preview-note-error {
  border: 1px solid rgba(248, 113, 113, 0.2);
  background: rgba(248, 113, 113, 0.08);
}

.workspace-preview-note-warning {
  border: 1px solid rgba(250, 204, 21, 0.3);
  background: rgba(250, 204, 21, 0.1);
}

.workspace-preview-evidence-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  background: var(--surface);
}

.workspace-preview-evidence-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-soft);
}

.workspace-preview-evidence-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 20px 24px 0;
}

.workspace-preview-evidence-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--border-soft);
  background: var(--surface-muted);
}

.workspace-preview-evidence-stat strong {
  color: var(--text-main);
  font-size: 22px;
  font-weight: 700;
}

.workspace-preview-evidence-stat span {
  color: var(--text-muted);
  font-size: 12px;
}

.workspace-preview-evidence-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.workspace-preview-evidence-panel {
  padding: 24px 20px;
  overflow: auto;
  background: var(--surface-muted);
}

.workspace-preview-evidence-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-preview-evidence-card-head,
.workspace-preview-reference-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-preview-evidence-card h3 {
  margin: 0;
  color: var(--text-main);
  font-size: 20px;
  line-height: 1.35;
}

.workspace-preview-evidence-context {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.16);
}

.workspace-preview-evidence-context span,
.workspace-preview-evidence-label {
  color: var(--text-muted);
  font-size: 12px;
}

.workspace-preview-evidence-context strong {
  color: var(--text-main);
  font-size: 14px;
}

.workspace-preview-evidence-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-preview-evidence-meta div {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
}

.workspace-preview-evidence-meta dt {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.workspace-preview-evidence-meta dd {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.workspace-preview-evidence-meta dd a {
  color: var(--primary);
  text-decoration: none;
}

.workspace-preview-evidence-meta dd a:hover {
  text-decoration: underline;
}

.workspace-preview-evidence-jumps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-preview-evidence-jump-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-preview-evidence-jump-btn,
.workspace-preview-evidence-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.workspace-preview-evidence-jump-btn:hover,
.workspace-preview-evidence-action-btn:hover {
  color: var(--text-main);
  border-color: var(--primary);
}

.workspace-preview-evidence-action-btn.primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.workspace-preview-evidence-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.workspace-preview-evidence-raw {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.workspace-preview-report-prose {
  color: var(--text-main);
  max-width: 820px;
  margin: 0 auto;
}

.workspace-preview-report-prose :deep(h1),
.workspace-preview-report-prose :deep(h2),
.workspace-preview-report-prose :deep(h3),
.workspace-preview-report-prose :deep(h4) {
  color: var(--text-main);
  font-weight: 800;
  line-height: 1.3;
}

.workspace-preview-report-prose :deep(h1) {
  margin: 0 0 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-soft);
  font-size: clamp(26px, 2vw, 32px);
}

.workspace-preview-report-prose :deep(h2) {
  margin: 32px 0 16px;
  font-size: clamp(20px, 1.5vw, 24px);
}

.workspace-preview-report-prose :deep(h3) {
  margin: 24px 0 12px;
  font-size: 18px;
}

.workspace-preview-report-prose :deep(p),
.workspace-preview-report-prose :deep(li),
.workspace-preview-report-prose :deep(blockquote) {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.8;
  margin-bottom: 14px;
}

.workspace-preview-report-prose :deep(.workspace-preview-citation-chip) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 26px;
  margin: 0 4px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  vertical-align: baseline;
  transition: all 0.2s ease;
}

.workspace-preview-report-prose :deep(.workspace-preview-citation-chip:hover) {
  border-color: rgba(37, 99, 235, 0.4);
  background: rgba(37, 99, 235, 0.14);
}

.workspace-preview-report-prose :deep(.workspace-preview-citation-chip-repeated) {
  border-color: rgba(14, 165, 233, 0.28);
  background: rgba(14, 165, 233, 0.12);
}

.workspace-preview-report-prose :deep(.workspace-preview-citation-chip-active) {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.18);
}

.workspace-preview-docx {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

:deep(.docx-wrapper) {
  background: transparent !important;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
}

:deep(.docx-wrapper > section.docx) {
  background: #ffffff !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08) !important;
  border-radius: 8px !important;
  margin-bottom: 0 !important;
  width: 100% !important;
  max-width: 820px !important;
  min-height: 1056px !important;
  padding: 60px !important;
  color: #333 !important;
}

.workspace-preview-action-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.workspace-preview-sections {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.workspace-preview-section-card {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
}

.workspace-preview-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border-soft);
}

.workspace-preview-section-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface-strong);
  padding: 2px 10px;
  border-radius: 8px;
}

.workspace-preview-evidence-section-header {
  gap: 16px;
}

.workspace-preview-evidence-section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.workspace-preview-evidence-section-heading strong,
.workspace-preview-reference-card strong,
.workspace-preview-reference-number {
  color: var(--text-main);
}

.workspace-preview-evidence-section-heading strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-preview-evidence-section-count,
.workspace-preview-reference-count {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.workspace-preview-evidence-reference-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
}

.workspace-preview-reference-card {
  width: 100%;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-preview-reference-card:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
}

.workspace-preview-reference-card.active {
  border-color: var(--primary);
  background: rgba(37, 99, 235, 0.06);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
}

.workspace-preview-reference-card strong {
  display: block;
  margin-top: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.workspace-preview-reference-card p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.workspace-preview-reference-number {
  font-size: 13px;
  font-weight: 700;
}

.workspace-preview-section-regen-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface);
  color: var(--primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-preview-section-regen-btn:hover:not([disabled]) {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.workspace-preview-section-regen-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-preview-section-content {
  padding: 24px;
}

@media (max-width: 1180px) {
  .workspace-preview-evidence-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-preview-evidence-main {
    border-right: none;
  }

  .workspace-preview-evidence-panel {
    border-top: 1px solid var(--border-soft);
  }
}

@media (max-width: 780px) {
  .workspace-preview-head {
    align-items: flex-start;
  }

  .workspace-preview-head-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .workspace-preview-evidence-summary {
    grid-template-columns: 1fr;
  }

  .workspace-preview-evidence-scroll {
    padding: 16px;
  }

  .workspace-preview-evidence-panel {
    padding: 16px;
  }

  .workspace-preview-section-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .workspace-preview-section-content,
  .workspace-preview-evidence-reference-list {
    padding: 16px;
  }
}

.workspace-preview-regen-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-preview-regen-dialog {
  background: var(--surface);
  border-radius: 16px;
  padding: 28px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.workspace-preview-regen-dialog h3 {
  margin: 0 0 8px;
  font-size: 17px;
  color: var(--text-main);
}

.workspace-preview-regen-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.workspace-preview-regen-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
  background: var(--surface-muted);
  color: var(--text-main);
}

.workspace-preview-regen-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.workspace-preview-regen-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.workspace-preview-regen-cancel,
.workspace-preview-regen-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.workspace-preview-regen-cancel {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.workspace-preview-regen-cancel:hover {
  background: var(--surface-strong);
}

.workspace-preview-regen-confirm {
  background: var(--primary);
  color: #fff;
}

.workspace-preview-regen-confirm:hover {
  filter: brightness(1.08);
}
</style>
