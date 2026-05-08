<script setup>
import { computed, nextTick, ref, watch } from 'vue';

import WorkspaceFileCard from '@/features/workspace/components/WorkspaceFileCard.vue';
import WorkspacePreviewPanel from '@/features/workspace/components/WorkspacePreviewPanel.vue';
import RealtimePreview from '@/features/workspace/components/RealtimePreview.vue';
import SectionRewritePanel from '@/features/workspace/components/SectionRewritePanel.vue';
import ClarificationMessage from '@/features/workspace/components/ClarificationMessage.vue';
import RequirementSummaryCard from '@/features/workspace/components/RequirementSummaryCard.vue';
import TaskCard from '@/features/workspace/components/TaskCard.vue';
import TemplateSelector from '@/features/templates/components/TemplateSelector.vue';
import GradientPulseLoader from '@/shared/ui/GradientPulseLoader.vue';
import { explainTaskFailure } from '@/features/workspace/utils/task-failure';
import { getComposerAttachmentHint, getTaskAttachmentFeedback } from '@/features/workspace/utils/task-attachments';

const props = defineProps({
  currentUser: { type: Object, default: () => ({}) },
  flash: { type: Object, default: () => ({ type: '', text: '' }) },
  loading: { type: Object, default: () => ({}) },
  sessions: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
  selectedSessionId: { type: String, default: '' },
  currentSessionDetail: { type: Object, default: null },
  currentSessionTasks: { type: Array, default: () => [] },
  recentTaskHistory: { type: Array, default: () => [] },
  taskHistory: { type: Array, default: () => [] },
  selectedFiles: { type: Array, default: () => [] },
  selectedFileIds: { type: Array, default: () => [] },
  selectedTemplateFile: { type: Object, default: null },
  selectedApiTemplate: { type: Object, default: null },
  codeFiles: { type: Array, default: () => [] },
  codeAnalysis: { type: Object, default: null },
  codeAnalyzing: { type: Boolean, default: false },
  currentTask: { type: Object, default: null },
  currentTaskCode: { type: Number, default: 200 },
  currentTaskProgress: { type: Number, default: 0 },
  currentTaskTone: { type: String, default: 'idle' },
  currentTaskFailure: { type: Object, default: null },
  canDownloadReport: { type: Boolean, default: false },
  downloadStatesByTaskId: { type: Object, default: () => ({}) },
  sessionForm: { type: Object, default: () => ({ title: '' }) },
  taskUserInput: { type: String, default: '' },
  taskOutline: { type: String, default: '' },
  taskCitationStyle: { type: String, default: 'gb' },
  taskTargetWordCount: { type: Number, default: null },
  taskGenerationMode: { type: String, default: 'paper_format_to_paper' },
  taskVenueLabel: { type: String, default: 'IEEE' },
  taskVenueVariant: { type: String, default: 'conference' },
  taskAuthors: { type: String, default: '' },
  taskControlMode: { type: String, default: 'batch_autopilot' },
  sessionFormError: { type: String, default: '' },
  taskFormError: { type: String, default: '' },
  isCreateSessionDisabled: { type: Boolean, default: false },
  isCreateTaskDisabled: { type: Boolean, default: false },
  showAdminEntry: { type: Boolean, default: false },
  inlineClarifyMessages: { type: Array, default: () => [] },
  clarifyProcessing: { type: Boolean, default: false },
  clarifyActive: { type: Boolean, default: false },
  streamingSections: { type: Array, default: () => [] },
  isStreamingContent: { type: Boolean, default: false },
  archiveAnalysis: { type: Object, default: null },
});

const emit = defineEmits([
  'go-admin', 'refresh-data', 'create-session', 'select-session', 'delete-session', 'rename-session',
  'update:task-user-input', 'update:task-outline', 'update:task-citation-style', 'update:task-target-word-count',
  'update:task-generation-mode', 'update:task-venue-label', 'update:task-venue-variant', 'update:task-authors',
  'update:task-control-mode',
  'apply-prompt', 'create-task',
  'download-task-report', 'refresh-task', 'retry-task', 'cancel-task', 'refresh-task-list', 'upload-files',
  'upload-template', 'toggle-file-selection', 'delete-file', 'update-task-markdown',
  'update:selected-api-template', 'upload-code-files', 'remove-code-file',
  'clarify-answer', 'clarify-confirm', 'clarify-modify', 'clarify-skip',
  'section-rewrite-accept', 'show-archive-upload',
]);

const activePreview = ref(null);
const isSidebarCollapsed = ref(false);
const sessionSearchQuery = ref('');
const renamingSessionId = ref(null);

// Section rewrite state
const rewriteVisible = ref(false);
const rewriteTarget = ref(null);

function onSectionRewrite(sectionData) {
  rewriteTarget.value = sectionData;
  rewriteVisible.value = true;
}

function onRewriteAccept({ sectionIndex, newContent }) {
  emit('section-rewrite-accept', { sectionIndex, newContent });
  rewriteVisible.value = false;
  rewriteTarget.value = null;
}

function onRewriteClose() {
  rewriteVisible.value = false;
  rewriteTarget.value = null;
}
const renameInput = ref('');
const timelineTasks = computed(() => Array.isArray(props.taskHistory) ? props.taskHistory.filter(Boolean) : []);

const filteredSessions = computed(() => {
  const query = sessionSearchQuery.value.trim().toLowerCase();
  if (!query) return props.sessions;
  return props.sessions.filter(s =>
    (s.title || '').toLowerCase().includes(query) ||
    (s.sessionId || '').toLowerCase().includes(query)
  );
});
const composerAttachmentHint = computed(() => getComposerAttachmentHint(props.selectedFiles));
const formatConflictNotice = computed(() => {
  if (props.taskGenerationMode !== 'paper_format_to_paper') {
    return '';
  }
  if (!props.taskVenueLabel || !props.selectedTemplateFile) {
    return '';
  }
  if (props.taskControlMode === 'interactive_agent') {
    return '已指定 IEEE：若上传样张/要求文档与 IEEE 冲突，agent 会暂停并让你确认。';
  }
  return '已指定 IEEE：自动模式会优先遵守 IEEE，上传样张只作为内容/局部风格参考。';
});

// 内联消息自动滚动
const chatScrollEl = ref(null);

async function scrollChatToBottom() {
  await nextTick();
  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight;
  }
}

watch(() => props.inlineClarifyMessages.length, () => {
  scrollChatToBottom();
});

watch(() => props.clarifyProcessing, () => {
  scrollChatToBottom();
});

watch(() => props.selectedSessionId, () => {
  activePreview.value = null;
});

function startRename(session) {
  renamingSessionId.value = session.sessionId;
  renameInput.value = session.title;
}
function submitRename(sessionId) {
  const title = renameInput.value.trim();
  if (title && title !== (props.sessions.find(s => s.sessionId === sessionId)?.title || '')) {
    emit('rename-session', sessionId, title);
  }
  renamingSessionId.value = null;
}
function cancelRename() {
  renamingSessionId.value = null;
}

function inferFileType(fileName = '', fileType = '') {
  const normalizedType = String(fileType || '').trim().toLowerCase();
  if (normalizedType) {
    return normalizedType.includes('/') ? normalizedType.split('/').at(-1) : normalizedType.replace(/^\./, '');
  }
  const extensionMatch = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return extensionMatch?.[1] || 'file';
}

function getTaskHeading(task) {
  const status = String(task?.status || '').toLowerCase();
  if (status === 'completed') return '报告已生成';
  if (status === 'running' || status === 'processing') return '正在分析';
  if (status === 'pending' || status === 'queued') return '排队处理中';
  if (status === 'failed' || status === 'error' || status === 'cancelled') return '任务失败';
  return task?.status || '等待处理';
}

function getTaskCode(task) {
  const status = String(task?.status || '').toLowerCase();
  if (['pending', 'processing', 'running', 'queued'].includes(status)) return 202;
  if (['failed', 'error', 'cancelled'].includes(status)) return 500;
  return 200;
}

function getTaskProgress(task) {
  return Math.max(0, Math.min(task?.progress ?? 0, 100));
}

function getStageIcon(stage) {
  const icons = { planning: '📋', retrieving: '🔍', writing: '📝', normalizing: '✨', quality_check: '✅' };
  return icons[stage] || '⏳';
}

function formatEta(seconds) {
  if (seconds == null || seconds < 0) return '';
  if (seconds < 60) return '< 1分钟';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `约${mins}分${secs}秒` : `约${mins}分钟`;
}

function getTaskFailure(task) {
  return explainTaskFailure(task, getTaskCode(task));
}

function getTaskAttachmentState(task) {
  return getTaskAttachmentFeedback(task);
}

function hasTaskAttachmentInfo(task) {
  return Boolean(
    task?.templateFileId
    || task?.templateFileName
    || (Array.isArray(task?.usedFiles) && task.usedFiles.length)
  );
}

function canDownloadTask(task) {
  return String(task?.status || '').toLowerCase() === 'completed'
    && Boolean(task?.taskId)
    && Boolean(
      task?.resultFileId
      || task?.resultMarkdown?.trim()
      || Object.keys(task?.artifactPaths || {}).length
    );
}

function canRetryTask(task) {
  if (String(task?.status || '').toLowerCase() !== 'failed') return false;
  if (!task?.taskId) return false;
  const retryCount = task?.retryCount ?? 0;
  const maxRetries = task?.maxRetries ?? 3;
  return retryCount < maxRetries;
}

function isTaskCancellable(task) {
  const status = String(task?.status || '').toLowerCase();
  return ['pending', 'processing', 'running', 'queued'].includes(status);
}

function getRetryLabel(task) {
  const retryCount = task?.retryCount ?? 0;
  const maxRetries = task?.maxRetries ?? 3;
  if (retryCount >= maxRetries) return `重试次数已用完 (${retryCount}/${maxRetries})`;
  return `重试 (${retryCount}/${maxRetries})`;
}

function getDownloadStates(taskId) {
  return props.downloadStatesByTaskId?.[taskId] || {
    docx: false,
    pdf: false,
    md: false,
    latex: false,
    tex: false,
    bib: false,
    audit: false,
    source: false
  };
}

function getPaperQualityChecks(task) {
  const artifacts = task?.artifactPaths || {};
  if (!Object.keys(artifacts).length) {
    return [];
  }
  const completed = String(task?.status || '').toLowerCase() === 'completed';
  return [
    { label: 'IEEE 格式审计', passed: completed && Boolean(artifacts.audit_path), detail: artifacts.audit_path ? 'audit.json 已生成' : '等待审计报告' },
    { label: '引用来源审计', passed: completed && Boolean(artifacts.audit_path), detail: artifacts.audit_path ? '写入 audit report' : '等待引用审计' },
    { label: 'PDF 编译', passed: completed && Boolean(artifacts.pdf_path), detail: artifacts.pdf_path ? 'paper.pdf 可预览' : '等待 PDF' },
    { label: 'DOCX 导出', passed: completed && Boolean(artifacts.docx_path), detail: artifacts.docx_path ? 'paper.docx 可下载' : '等待 DOCX' },
    { label: 'Source bundle', passed: completed && Boolean(artifacts.source_bundle_path), detail: artifacts.source_bundle_path ? '可溯源包已生成' : '等待 source bundle' },
  ];
}

function getTaskMessageFiles(task) {
  const output = [];
  if (task?.templateFileId || task?.templateFileName) {
    output.push({
      role: 'template',
      fileId: task.templateFileId || '',
      fileName: task.templateFileName || '未命名模板',
      fileType: inferFileType(task.templateFileName, task.templateFileType),
      subtitle: '本次任务模板'
    });
  }
  (Array.isArray(task?.usedFiles) ? task.usedFiles : []).forEach((file) => {
    output.push({
      role: 'attachment',
      fileId: file.fileId || '',
      fileName: file.fileName || '未命名附件',
      fileType: inferFileType(file.fileName, file.fileType),
      subtitle: '随消息提交的附件'
    });
  });
  return output;
}

function buildReportBaseName(task) {
  const source = String(task?.userInput || '').replace(/\s+/g, ' ').trim();
  if (!source) {
    return task?.taskId ? `research-report-${task.taskId}` : 'research-report';
  }

  const sanitized = source
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, '-')
    .trim()
    .slice(0, 36);

  return sanitized || (task?.taskId ? `research-report-${task.taskId}` : 'research-report');
}

function getReportTitle(task) {
  return task?.resultFileName || `${buildReportBaseName(task)}.docx`;
}

function findTaskSnapshot(taskId) {
  return timelineTasks.value.find((item) => item.taskId === taskId) || null;
}

function openReportPreview(task) {
  if (!task?.taskId) {
    return;
  }
  activePreview.value = { kind: 'report', taskId: task?.taskId || '' };
}

function openFilePreview(task, file) {
  activePreview.value = {
    kind: 'file',
    taskId: task?.taskId || '',
    fileRole: file.role,
    fileId: file.fileId,
    fileName: file.fileName,
    fileType: file.fileType,
    title: file.fileName
  };
}

function isFilePreviewActive(task, file) {
  return activePreview.value?.kind === 'file'
    && activePreview.value?.taskId === (task?.taskId || '')
    && activePreview.value?.fileRole === file.role
    && activePreview.value?.fileId === file.fileId
    && activePreview.value?.fileName === file.fileName;
}

const resolvedPreview = computed(() => {
  if (!activePreview.value) return null;
  if (activePreview.value.kind === 'report') {
    const task = findTaskSnapshot(activePreview.value.taskId);
    if (!task) return null;
    return {
      kind: 'report',
      taskId: task.taskId,
      title: getReportTitle(task),
      markdown: task.resultMarkdown || '',
      status: task.status,
      artifactPaths: task.artifactPaths || {}
    };
  }
  return activePreview.value;
});

const currentRunStatus = computed(() => {
  const status = String(props.currentTask?.status || '').toLowerCase();
  if (!props.currentTask) return { label: 'Idle', tone: 'idle', detail: '等待新的论文生成任务' };
  if (['completed', 'success', 'succeeded'].includes(status)) {
    return { label: 'Completed', tone: 'success', detail: '产物已生成，可预览与下载' };
  }
  if (['failed', 'error', 'cancelled'].includes(status)) {
    return { label: 'Blocked', tone: 'danger', detail: props.currentTaskFailure?.summary || '任务未完成，需要处理错误后重试' };
  }
  if (['running', 'processing', 'queued', 'pending'].includes(status)) {
    return { label: 'Running', tone: 'active', detail: props.currentTask?.stageName || 'agent 正在执行' };
  }
  return { label: status || 'Idle', tone: 'idle', detail: '暂无运行中的任务' };
});

const agentStageCards = computed(() => {
  const activeStage = props.currentTask?.stage || '';
  const running = ['running', 'processing', 'queued', 'pending'].includes(
    String(props.currentTask?.status || '').toLowerCase()
  );
  return [
    { key: 'intent_parse', label: 'Intent', detail: '解析主题/资料/代码入口' },
    { key: 'clarify', label: 'Clarify', detail: '批量澄清研究缺口' },
    { key: 'format_resolve', label: 'Format', detail: '锁定 IEEE 变体与模板' },
    { key: 'literature_search', label: 'Sources', detail: '规划文献与来源验证' },
    { key: 'draft', label: 'Draft', detail: '生成正文与章节结构' },
    { key: 'citation_verify', label: 'Audit', detail: '引用、格式、产物审计' },
    { key: 'export', label: 'Export', detail: 'LaTeX -> PDF/DOCX/source' }
  ].map((stage) => ({
    ...stage,
    active: activeStage === stage.key || props.currentTask?.stageName?.toLowerCase?.().includes(stage.label.toLowerCase()),
    done: !running && Boolean(props.currentTask)
      && !['failed', 'error', 'cancelled'].includes(String(props.currentTask?.status || '').toLowerCase())
  }));
});

const artifactCards = computed(() => {
  const artifacts = props.currentTask?.artifactPaths || {};
  return [
    { key: 'pdf_path', label: 'PDF', format: 'pdf' },
    { key: 'tex_path', label: 'TeX', format: 'tex' },
    { key: 'docx_path', label: 'DOCX', format: 'docx' },
    { key: 'bib_path', label: 'BibTeX', format: 'bib' },
    { key: 'audit_path', label: 'Audit', format: 'audit' },
    { key: 'source_bundle_path', label: 'Source', format: 'source' }
  ].map((item) => ({
    ...item,
    ready: Boolean(artifacts[item.key])
  }));
});

function handlePreviewDownload(format) {
  if (!resolvedPreview.value?.taskId) return;
  emit('download-task-report', { taskId: resolvedPreview.value.taskId, format });
}

function handlePreviewMarkdownUpdate(newMarkdown) {
  emit('update-task-markdown', { taskId: resolvedPreview.value?.taskId, markdown: newMarkdown });
}
</script>

<template>
  <div class="chat-console" :class="{ 'preview-open': resolvedPreview }" role="main" aria-label="工作台">
    <aside class="chat-sidebar" :class="{ collapsed: isSidebarCollapsed }" role="navigation" aria-label="会话列表">
      <div class="sidebar-brand" v-show="!isSidebarCollapsed">
        <div class="window-dots" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="brand-copy">
          <strong>IntelliGen</strong>
          <span>Paper agent</span>
        </div>
      </div>

      <div class="sidebar-header">
        <button class="btn-icon toggle-btn" type="button" @click="isSidebarCollapsed = !isSidebarCollapsed" title="收起/展开侧边栏" aria-label="收起/展开侧边栏">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      <button class="btn btn-primary new-chat-btn" type="button" :disabled="loading.session" @click="emit('create-session')" :title="isSidebarCollapsed ? '新建会话' : ''">
        <svg v-if="isSidebarCollapsed" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span v-else>{{ loading.session ? '创建中...' : '新建会话' }}</span>
      </button>

      <div class="sidebar-search" v-show="!isSidebarCollapsed && sessions.length > 3">
        <input
          type="text"
          v-model="sessionSearchQuery"
          placeholder="搜索会话..."
          class="search-input"
          aria-label="搜索会话"
        />
        <button v-if="sessionSearchQuery" class="btn-icon clear-search" @click="sessionSearchQuery = ''" title="清除搜索">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <span v-if="!isSidebarCollapsed && sessionSearchQuery && filteredSessions.length > 0" class="search-count">
        {{ filteredSessions.length }}/{{ sessions.length }}
      </span>

      <ul class="thread-list" v-show="!isSidebarCollapsed">
        <div v-if="loading.bootstrap" class="loader-wrapper small">
          <GradientPulseLoader text="加载会话列表..." />
        </div>
        <template v-else>
          <li v-if="filteredSessions.length === 0 && sessionSearchQuery" class="no-results">
            未找到匹配的会话
          </li>
          <li v-for="session in filteredSessions" :key="session.sessionId" :class="{ active: session.sessionId === selectedSessionId }" @click="emit('select-session', session.sessionId)">
            <template v-if="renamingSessionId === session.sessionId">
              <input
                class="thread-rename-input"
                v-model="renameInput"
                @click.stop
                @keydown.enter.stop="submitRename(session.sessionId)"
                @keydown.escape.stop="cancelRename()"
                @blur="submitRename(session.sessionId)"
                ref="renameInputRef"
                autofocus
                maxlength="100"
              />
            </template>
            <template v-else>
              <div class="thread-main" :title="session.title + '\n双击重命名'" @dblclick.stop="startRename(session)">{{ session.title }}</div>
            </template>
            <button type="button" class="thread-delete" @click.stop="emit('delete-session', session.sessionId)" title="删除会话">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </li>
        </template>
      </ul>
    </aside>

    <section class="chat-main">
      <header class="chat-topbar">
        <div class="topbar-title">
          <div class="kicker">Paper Agent Workspace</div>
          <h1>{{ currentSessionDetail?.title || '开启新的论文生成 run' }}</h1>
          <p>Topic / material / code → clarify → IEEE LaTeX → PDF audit</p>
        </div>
        <div class="topbar-actions">
          <span class="run-pill" :class="`run-pill-${currentRunStatus.tone}`">{{ currentRunStatus.label }}</span>
          <button class="btn btn-secondary btn-mini" type="button" @click="emit('refresh-data')">Sync</button>
        </div>
      </header>

      <div v-if="flash.text" class="message-bar" :class="flash.type === 'error' ? 'message-error' : 'message-success'">
        {{ flash.text }}
      </div>

      <div class="chat-stage">
        <div v-if="loading.workspace || loading.bootstrap" class="loader-wrapper large">
          <GradientPulseLoader text="正在加载会话详情..." />
        </div>
        <div v-else class="chat-scroll" ref="chatScrollEl">
          <div v-if="!timelineTasks.length && !inlineClarifyMessages.length" class="codex-empty-state">
            <div class="empty-orb">IG</div>
            <div>
              <p class="empty-eyebrow">Research paper agent</p>
              <h2>What should we write?</h2>
              <p>默认使用 IEEE paper mode、批量澄清和 LaTeX -> PDF 导出。右侧会持续展示阶段、质量门和产物状态。</p>
              <div class="empty-quickstarts" aria-label="快速入口">
                <span>Research idea</span>
                <span>Upload materials</span>
                <span>Browse code</span>
              </div>
            </div>
          </div>

          <template v-for="(task, index) in timelineTasks" :key="task.taskId || `draft-${index}`">
            <article v-if="task.userInput" class="message user">
                <div class="message-card user-card">
                  <div class="message-meta">
                    <span>User prompt</span>
                    <span>{{ task.taskId ? 'submitted' : 'draft' }}</span>
                </div>
                <div v-if="getTaskMessageFiles(task).length" class="file-grid">
                  <WorkspaceFileCard
                    v-for="file in getTaskMessageFiles(task)"
                    :key="`${task.taskId}-${file.role}-${file.fileId}-${file.fileName}`"
                    :file-name="file.fileName"
                    :file-type="file.fileType"
                    :subtitle="file.subtitle"
                    :badge="file.role === 'template' ? '本次模板' : '附件'"
                    :active="isFilePreviewActive(task, file)"
                    :disabled="!file.fileId"
                    @click="openFilePreview(task, file)"
                  />
                </div>
                <p>{{ task.userInput }}</p>
                <p v-if="task.outline" class="subtext">补充要求：{{ task.outline }}</p>
              </div>
            </article>

            <article class="message assistant">
              <div class="avatar">AI</div>
              <div class="message-card result-card">
                <div class="message-meta">
                  <span>Agent activity</span>
                  <span>{{ getTaskProgress(task) }}%</span>
                </div>
                <h2>{{ getTaskHeading(task) }}</h2>
                <div v-if="getTaskProgress(task) > 0" class="progress-line" role="progressbar" :aria-valuenow="getTaskProgress(task)" aria-valuemin="0" aria-valuemax="100" :aria-label="`任务进度 ${getTaskProgress(task)}%`">
                  <span class="progress-bar" :style="{ width: `${getTaskProgress(task)}%` }"></span>
                </div>
                <div class="helper-text">
                  <span>
                    <span v-if="task.stageName" class="stage-badge">{{ getStageIcon(task.stage) }} {{ task.stageName }}</span>
                    <span v-if="getTaskProgress(task) > 0">进度 {{ getTaskProgress(task) }}%</span>
                    <span v-else>Queued in engine</span>
                    <span v-if="task.currentSectionTitle" class="section-hint"> · 正在撰写: {{ task.currentSectionTitle }}</span>
                    <span v-if="task.estimatedSecondsLeft != null" class="eta-hint"> · 预计剩余: {{ formatEta(task.estimatedSecondsLeft) }}</span>
                  </span>
                  <button
                    v-if="isTaskCancellable(task)"
                    class="activity-stop"
                    type="button"
                    @click="emit('cancel-task', task.taskId)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    Stop
                  </button>
                </div>

                <div v-if="hasTaskAttachmentInfo(task)" class="attachment-panel">
                  <strong>{{ getTaskAttachmentState(task).title }}</strong>
                  <p>{{ getTaskAttachmentState(task).summary }}</p>
                </div>

                <div v-if="getTaskFailure(task)" class="failure-panel">
                  <strong>{{ getTaskFailure(task).title }}</strong>
                  <p>{{ getTaskFailure(task).summary }}</p>
                  <div class="failure-actions">
                    <button
                      v-if="canRetryTask(task)"
                      class="btn btn-secondary btn-mini btn-with-icon"
                      type="button"
                      @click="emit('retry-task', task.taskId)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                      {{ getRetryLabel(task) }}
                    </button>
                    <span v-else-if="(task?.retryCount ?? 0) >= (task?.maxRetries ?? 3) && String(task?.status || '').toLowerCase() === 'failed'" class="retry-exhausted">
                      重试次数已用完 ({{ task?.retryCount ?? 0 }}/{{ task?.maxRetries ?? 3 }})
                    </span>
                  </div>
                </div>

                <div v-if="canDownloadTask(task)" class="report-card">
                  <div>
                    <strong>{{ getReportTitle(task) }}</strong>
                    <p>产物已生成，可在右侧预览或下载完整 source bundle。</p>
                  </div>
                  <div class="report-actions">
                    <button class="btn btn-secondary btn-mini btn-with-icon" type="button" :disabled="!task.taskId" @click="openReportPreview(task)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                      右侧大屏预览
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).docx" @click="emit('download-task-report', { taskId: task.taskId, format: 'docx' })">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {{ getDownloadStates(task.taskId).docx ? '下载中...' : '下载 DOCX' }}
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).pdf" @click="emit('download-task-report', { taskId: task.taskId, format: 'pdf' })">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {{ getDownloadStates(task.taskId).pdf ? '下载中...' : '下载 PDF' }}
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).tex" @click="emit('download-task-report', { taskId: task.taskId, format: 'tex' })">
                      TeX
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).bib" @click="emit('download-task-report', { taskId: task.taskId, format: 'bib' })">
                      BibTeX
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).audit" @click="emit('download-task-report', { taskId: task.taskId, format: 'audit' })">
                      Audit
                    </button>
                    <button class="btn btn-ghost btn-mini btn-with-icon" type="button" :disabled="!canDownloadTask(task) || getDownloadStates(task.taskId).source" @click="emit('download-task-report', { taskId: task.taskId, format: 'source' })">
                      Source
                    </button>
                  </div>
                </div>

                <div v-if="getPaperQualityChecks(task).length" class="quality-panel">
                  <div class="quality-panel-head">
                    <strong>论文质量门</strong>
                    <span>格式 / 引用 / 导出 / 溯源</span>
                  </div>
                  <div class="quality-check-grid">
                    <div
                      v-for="check in getPaperQualityChecks(task)"
                      :key="check.label"
                      class="quality-check"
                      :class="{ passed: check.passed }"
                    >
                      <span class="quality-check-dot"></span>
                      <div>
                        <strong>{{ check.label }}</strong>
                        <p>{{ check.detail }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </template>

          <!-- 内联澄清对话流 -->
          <template v-for="msg in inlineClarifyMessages" :key="msg.id">
            <!-- 用户输入 -->
            <article v-if="msg.type === 'user_text'" class="message user">
              <div class="message-card user-card">
                <div class="message-meta">
                  <span>你的需求</span>
                </div>
                <p>{{ msg.content }}</p>
              </div>
            </article>

            <!-- 系统问题（带药丸选项） -->
            <ClarificationMessage
              v-else-if="msg.type === 'system_question'"
              :message="msg"
              @answer="(qId, answer) => emit('clarify-answer', { questionId: qId, answer })"
            />

            <!-- 用户回答 -->
            <article v-else-if="msg.type === 'user_answer'" class="message user">
              <div class="message-card user-card inline-answer-card">
                <p>{{ msg.content }}</p>
              </div>
            </article>

            <!-- 需求摘要卡片 -->
            <RequirementSummaryCard
              v-else-if="msg.type === 'task_card'"
              :message="msg"
              @confirm="emit('clarify-confirm')"
              @modify="emit('clarify-modify')"
            />

            <!-- 进度/系统提示 -->
            <article v-else-if="msg.type === 'progress_update'" class="message assistant">
              <div class="avatar">AI</div>
              <div class="message-card result-card inline-progress-card">
                <p>{{ msg.content }}</p>
              </div>
            </article>

            <!-- 任务状态卡片 -->
            <article v-else-if="msg.type === 'task_status'" class="message assistant">
              <div class="avatar">AI</div>
              <TaskCard :task="msg.task" />
            </article>
          </template>

          <!-- 澄清中的打字指示器 -->
          <div v-if="clarifyProcessing" class="inline-typing-indicator">
            <div class="avatar">AI</div>
            <div class="typing-dots"><span /><span /><span /></div>
          </div>
        </div>
      </div>

      <form class="chat-composer" :class="{ 'composer-disabled': clarifyActive }" @submit.prevent="emit('create-task')">
        <div v-if="clarifyActive" class="clarify-active-hint">
          <span class="hint-dot"></span>
          正在进行需求澄清，请在上方对话中回答问题...
          <button type="button" class="btn btn-ghost btn-mini" @click="emit('clarify-skip')">跳过澄清</button>
        </div>
        <div v-show="!clarifyActive" class="composer-prompt-header">
          <span>Ask the paper agent</span>
          <div>
            <strong>{{ taskVenueLabel || 'Format' }}</strong>
            <strong>{{ taskVenueVariant || 'variant' }}</strong>
            <strong>{{ taskControlMode === 'batch_autopilot' ? 'autopilot' : 'interactive' }}</strong>
          </div>
        </div>
        <div
          v-if="!clarifyActive && (selectedFiles.length || selectedTemplateFile || selectedApiTemplate || codeFiles.length || codeAnalyzing || archiveAnalysis)"
          class="draft-bar"
        >
          <span>{{ composerAttachmentHint }}</span>
          <span v-if="selectedTemplateFile">模板文件：{{ selectedTemplateFile.name }}</span>
          <span v-else-if="selectedApiTemplate">模板：{{ selectedApiTemplate.name }}</span>
          <span v-if="codeFiles.length">代码文件：{{ codeFiles.length }} 个</span>
          <span v-if="codeAnalyzing" class="code-analyzing-hint">正在分析代码...</span>
        </div>
        <div v-if="selectedFiles.length || codeFiles.length" class="selected-file-list">
          <span v-for="file in selectedFiles" :key="file.fileId" class="selected-file-pill" :title="file.fileName">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="file-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span class="file-name-text">{{ file.fileName }}</span>
            <button type="button" class="btn-remove" @click.prevent="emit('toggle-file-selection', file.fileId)" title="移除">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </span>
          <span v-for="(cf, idx) in codeFiles" :key="'code-' + idx" class="selected-file-pill code-pill" :title="cf.name">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="file-icon"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            <span class="file-name-text">{{ cf.name }}</span>
            <button type="button" class="btn-remove" @click.prevent="emit('remove-code-file', idx)" title="移除">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </span>
        </div>
        <textarea v-show="!clarifyActive" :value="taskUserInput" class="user-input" :disabled="clarifyActive" placeholder="Describe the paper, upload context, or point me at code..." @input="emit('update:task-user-input', $event.target.value)"></textarea>
        <div v-show="!clarifyActive" class="composer-actions">
          <div class="composer-left">
            <label class="btn btn-ghost btn-mini btn-with-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              <span>上传附件</span>
              <input type="file" multiple class="hidden-input" :disabled="loading.upload" @change="emit('upload-files', $event)" />
            </label>
            <label class="btn btn-ghost btn-mini btn-with-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>{{ selectedTemplateFile ? '已选模板' : '上传本次模板' }}</span>
              <input type="file" accept=".docx,.pdf" class="hidden-input" :disabled="loading.upload" @change="emit('upload-template', $event)" />
            </label>
            <label class="btn btn-ghost btn-mini btn-with-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              <span>上传代码</span>
              <input type="file" multiple accept=".py,.java,.js,.ts,.tsx,.jsx,.c,.cpp,.h,.hpp,.go,.rs,.zip" class="hidden-input" @change="emit('upload-code-files', Array.from($event.target.files || [])); $event.target.value = ''" />
            </label>
            <button type="button" class="btn btn-ghost btn-mini btn-with-icon" @click="emit('show-archive-upload')">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span>{{ archiveAnalysis ? '✓ 项目资料' : '上传项目资料' }}</span>
            </button>
            <details class="composer-options">
              <summary class="btn btn-ghost btn-mini btn-with-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.72 1 .8.2.04.4.06.6.06H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"></path></svg>
                <span>Options</span>
              </summary>
              <div class="composer-options-panel">
                <label>
                  <span>本次模板</span>
                  <TemplateSelector
                    :model-value="selectedApiTemplate"
                    @update:model-value="emit('update:selected-api-template', $event)"
                  />
                </label>
                <label>
                  <span>引用格式</span>
                  <select class="citation-style-select" :value="taskCitationStyle" @change="emit('update:task-citation-style', $event.target.value)" title="引用格式">
                    <option value="gb">GB/T 7714 (国标)</option>
                    <option value="apa">APA</option>
                    <option value="mla">MLA</option>
                    <option value="chicago">Chicago</option>
                  </select>
                </label>
                <label>
                  <span>生成模式</span>
                  <select class="citation-style-select" :value="taskGenerationMode" @change="emit('update:task-generation-mode', $event.target.value)" title="生成模式">
                    <option value="paper_format_to_paper">论文模式</option>
                    <option value="legacy_report">旧报告模式</option>
                  </select>
                </label>
                <label>
                  <span>目标格式</span>
                  <select class="citation-style-select" :value="taskVenueLabel" @change="emit('update:task-venue-label', $event.target.value)" title="目标格式">
                    <option value="IEEE">IEEE</option>
                  </select>
                </label>
                <label>
                  <span>IEEE 变体</span>
                  <select class="citation-style-select" :value="taskVenueVariant" @change="emit('update:task-venue-variant', $event.target.value)" title="IEEE 变体">
                    <option value="conference">IEEE Conference</option>
                    <option value="journal">IEEE Journal</option>
                  </select>
                </label>
                <label>
                  <span>作者</span>
                  <input
                    class="authors-input"
                    :value="taskAuthors"
                    placeholder="作者（逗号分隔）"
                    title="论文作者"
                    @input="emit('update:task-authors', $event.target.value)"
                  />
                </label>
                <label>
                  <span>控制模式</span>
                  <select class="citation-style-select" :value="taskControlMode" @change="emit('update:task-control-mode', $event.target.value)" title="控制模式">
                    <option value="batch_autopilot">批量澄清后自动处理</option>
                    <option value="interactive_agent">有问题就问我</option>
                  </select>
                </label>
                <label>
                  <span>目标字数</span>
                  <input
                    type="number"
                    class="word-count-input"
                    :value="taskTargetWordCount"
                    placeholder="默认2万"
                    min="5000"
                    max="100000"
                    step="1000"
                    @input="emit('update:task-target-word-count', $event.target.value ? Number($event.target.value) : null)"
                  />
                </label>
              </div>
            </details>
            <span v-if="taskFormError" class="composer-error">{{ taskFormError }}</span>
          </div>
          <button class="btn btn-accent btn-with-icon" type="submit" :disabled="isCreateTaskDisabled">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            <span>{{ loading.task ? '发送中...' : '发送任务' }}</span>
          </button>
        </div>
        <div v-if="formatConflictNotice" class="format-conflict-notice">
          {{ formatConflictNotice }}
        </div>
      </form>
    </section>

    <aside v-if="!resolvedPreview && !isStreamingContent" class="codex-inspector" aria-label="Run inspector">
      <section class="inspector-card hero-card">
        <div class="inspector-eyebrow">Run inspector</div>
        <h2>{{ currentRunStatus.label }}</h2>
        <p>{{ currentRunStatus.detail }}</p>
        <div class="inspector-progress">
          <span :style="{ width: `${currentTaskProgress}%` }"></span>
        </div>
        <div class="inspector-meta">
          <span>Mode</span>
          <strong>{{ taskGenerationMode === 'paper_format_to_paper' ? 'IEEE paper' : 'Legacy report' }}</strong>
        </div>
        <div class="inspector-meta">
          <span>Control</span>
          <strong>{{ taskControlMode === 'batch_autopilot' ? 'Batch autopilot' : 'Interactive agent' }}</strong>
        </div>
      </section>

      <section class="inspector-card">
        <div class="inspector-section-title">
          <span>Agent stages</span>
          <small>{{ Math.round(currentTaskProgress) }}%</small>
        </div>
        <div class="stage-stack">
          <div
            v-for="stage in agentStageCards"
            :key="stage.key"
            class="stage-row"
            :class="{ active: stage.active, done: stage.done }"
          >
            <span class="stage-dot"></span>
            <div>
              <strong>{{ stage.label }}</strong>
              <p>{{ stage.detail }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="inspector-card">
        <div class="inspector-section-title">
          <span>Quality gates</span>
          <small>{{ getPaperQualityChecks(currentTask).filter((item) => item.passed).length }}/{{ getPaperQualityChecks(currentTask).length || 5 }}</small>
        </div>
        <div v-if="getPaperQualityChecks(currentTask).length" class="mini-quality-list">
          <div
            v-for="check in getPaperQualityChecks(currentTask)"
            :key="check.label"
            class="mini-quality-row"
            :class="{ passed: check.passed }"
          >
            <span></span>
            <div>
              <strong>{{ check.label }}</strong>
              <p>{{ check.detail }}</p>
            </div>
          </div>
        </div>
        <p v-else class="muted-copy">生成后会在这里显示 IEEE 格式、引用、PDF、DOCX 与 source bundle 状态。</p>
      </section>

      <section class="inspector-card">
        <div class="inspector-section-title">
          <span>Artifacts</span>
          <small>{{ artifactCards.filter((item) => item.ready).length }}/{{ artifactCards.length }}</small>
        </div>
        <div class="artifact-grid">
          <button
            v-for="artifact in artifactCards"
            :key="artifact.key"
            type="button"
            class="artifact-chip"
            :class="{ ready: artifact.ready }"
            :disabled="!currentTask?.taskId || !artifact.ready || getDownloadStates(currentTask.taskId)[artifact.format]"
            @click="emit('download-task-report', { taskId: currentTask.taskId, format: artifact.format })"
          >
            {{ artifact.label }}
          </button>
        </div>
      </section>

      <button
        v-if="currentTask?.taskId"
        class="preview-cta"
        type="button"
        @click="openReportPreview(currentTask)"
      >
        打开右侧 PDF / DOCX 预览
      </button>
    </aside>

    <RealtimePreview
      v-if="isStreamingContent"
      class="global-preview-panel"
      :sections="streamingSections"
      :streaming="currentTaskTone === 'active'"
      :total-sections="streamingSections.length"
      :progress="currentTaskProgress"
      @close="() => {}"
      @rewrite-section="onSectionRewrite"
    />

    <SectionRewritePanel
      v-if="rewriteVisible && rewriteTarget"
      :task-id="currentTask?.id"
      :section-index="rewriteTarget.sectionIndex"
      :section-title="rewriteTarget.sectionTitle"
      :original-content="rewriteTarget.content"
      @accept="onRewriteAccept"
      @close="onRewriteClose"
    />

    <WorkspacePreviewPanel
      v-else-if="resolvedPreview"
      class="global-preview-panel"
      :preview="resolvedPreview"
      :download-states="getDownloadStates(resolvedPreview.taskId)"
      @close="activePreview = null"
      @download="handlePreviewDownload"
      @update:markdown="handlePreviewMarkdownUpdate"
    />
  </div>
</template>

<style scoped>
.chat-console {
  --surface: rgba(13, 15, 22, 0.92);
  --surface-strong: rgba(19, 22, 31, 0.96);
  --surface-muted: rgba(255, 255, 255, 0.045);
  --border-soft: rgba(148, 163, 184, 0.16);
  --text-main: #f4f7fb;
  --text-secondary: #cbd5e1;
  --text-muted: #7d8596;
  --shadow-card: 0 22px 60px rgba(0, 0, 0, 0.34);
  --primary: #e7edf6;
  --primary-strong: #f8fafc;
  --danger: #ef4444;
  display: grid;
  grid-template-columns: 292px minmax(520px, 1fr) 364px;
  gap: 12px;
  height: 100%;
  overflow: hidden;
  padding: 10px;
  color: #f4f7fb;
  background:
    radial-gradient(circle at 20% 0%, rgba(120, 130, 150, 0.12), transparent 28%),
    radial-gradient(circle at 88% 18%, rgba(95, 111, 138, 0.10), transparent 32%),
    linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0)),
    #08090d;
}
.chat-console.preview-open {
  grid-template-columns: 260px minmax(420px, 1fr) minmax(520px, 44vw);
}
.global-preview-panel { width: auto; min-width: 480px; max-width: none; flex-shrink: 0; animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
}
.chat-sidebar,
.chat-main,
.message-card,
.chat-composer,
.codex-inspector,
.inspector-card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(14, 16, 23, 0.90);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
  border-radius: 14px;
  backdrop-filter: blur(26px);
}
.chat-sidebar { min-width: 0; padding: 12px; display: flex; flex-direction: column; gap: 12px; min-height: 0; transition: all 0.3s; overflow: hidden; }
.chat-sidebar.collapsed { width: 68px; padding: 20px 14px; }
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.10);
}
.window-dots {
  display: inline-flex;
  gap: 6px;
}
.window-dots span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #3f4656;
}
.window-dots span:nth-child(1) { background: #ff5f57; }
.window-dots span:nth-child(2) { background: #febc2e; }
.window-dots span:nth-child(3) { background: #28c840; }
.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.brand-copy strong {
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.2;
}
.brand-copy span {
  color: #7d8596;
  font-size: 11px;
}
.sidebar-header { display: flex; align-items: center; justify-content: space-between; }
.chat-sidebar.collapsed .sidebar-header { justify-content: center; }
.chat-sidebar.collapsed .new-chat-btn { padding: 0; min-height: 40px; display: flex; justify-content: center; align-items: center; }
.btn-icon { background: transparent; border: none; color: #cbd5e1; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-icon:hover { background: rgba(148, 163, 184, 0.12); }
.thread-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; overflow: auto; flex: 1; min-height: 0; }
.thread-list li { display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(148, 163, 184, 0.10); background: rgba(255,255,255,0.026); border-radius: 10px; cursor: pointer; transition: all 0.16s; position: relative; overflow: hidden; }
.thread-list li:hover { border-color: rgba(226, 232, 240, 0.26); background: rgba(255,255,255,0.055); }
.thread-list li.active { border-color: rgba(226, 232, 240, 0.34); background: rgba(248, 250, 252, 0.095); filter: none; }
.thread-main { flex: 1; min-width: 0; padding: 12px 14px; text-align: left; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; cursor: pointer; }
.thread-rename-input { flex: 1; min-width: 0; padding: 8px 12px; margin: 4px; border: 1px solid var(--accent-primary, #818cf8); border-radius: 8px; background: var(--bg-body, #0f0d1a); color: var(--text-main); font-size: 14px; outline: none; }
.thread-delete { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0 14px; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; position: absolute; right: 0; top: 0; border-radius: 0 16px 16px 0; }
.thread-list li:hover .thread-delete, .thread-list li.active .thread-delete { opacity: 1; }
.thread-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }
.sidebar-search { padding: 0; margin-bottom: 0; position: relative; }
.search-input { width: 100%; padding: 7px 28px 7px 10px; border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 10px; font-size: 12px; background: rgba(255,255,255,0.035); color: #e5e7eb; outline: none; transition: border-color 0.2s, background 0.2s; box-sizing: border-box; }
.search-input:focus { border-color: rgba(226, 232, 240, 0.30); background: rgba(255,255,255,0.055); }
.search-input::placeholder { color: var(--text-muted, #999); }
.clear-search { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); padding: 2px; color: var(--text-muted, #999); }
.search-count { display: block; text-align: right; font-size: 11px; color: var(--text-muted, #999); padding: 2px 0 0; }
.no-results { padding: 12px 16px; color: var(--text-muted, #999); font-size: 13px; text-align: center; list-style: none; cursor: default; }
.chat-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; transition: all 0.3s; }
.chat-topbar { padding: 16px 18px; display: flex; justify-content: space-between; gap: 20px; align-items: center; border-bottom: 1px solid rgba(148, 163, 184, 0.12); background: rgba(8, 9, 13, 0.34); }
.chat-topbar > div:first-child { flex: 1 1 200px; min-width: 0; }
.chat-topbar h1 { margin: 4px 0 0; color: #f8fafc; font-size: 18px; line-height: 1.35; word-break: break-word; }
.topbar-title p {
  margin: 6px 0 0;
  color: #7d8596;
  font-size: 12px;
}
.kicker, .message-meta { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
.topbar-actions, .report-actions, .composer-actions, .composer-left { display: flex; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.chat-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; transition: all 0.3s ease; padding: 0 10px; }
.chat-scroll { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 16px; padding: 14px 8px; }
.message { display: flex; gap: 14px; }
.message.user { justify-content: flex-start; padding-left: 46px; }
.avatar { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(148, 163, 184, 0.16); background: rgba(255,255,255,0.05); color: #e2e8f0; font-weight: 700; font-size: 11px; }
.message-card { padding: 16px; border-radius: 13px; }
.user-card { width: min(820px, 100%); background: rgba(248, 250, 252, 0.08); border-color: rgba(248, 250, 252, 0.16); }
.result-card { width: min(860px, calc(100% - 54px)); }
.message-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.message-card h2, .message-card p { margin: 0; }
.message-card h2 { color: #f8fafc; font-size: 20px; }
.message-card p { color: #cbd5e1; line-height: 1.8; }
.subtext { margin-top: 10px !important; color: #94a3b8 !important; }
.file-grid { display: grid; gap: 10px; margin-bottom: 12px; }
.progress-line { margin-top: 12px; height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.14); overflow: hidden; }
.progress-bar { display: block; height: 100%; background: linear-gradient(90deg, #e2e8f0, #9ca3af); }
.helper-text { margin-top: 8px; color: #94a3b8; font-size: 12px; display: flex; align-items: center; justify-content: space-between; }
.cancel-btn { background: var(--danger); color: #fff; border: none; font-size: 12px; padding: 3px 10px; border-radius: 4px; cursor: pointer; }
.cancel-btn:hover { background: #dc2626; }
.activity-stop {
  border: 0;
  background: transparent;
  color: #9ca3af;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  cursor: pointer;
}
.activity-stop:hover { color: #fca5a5; }
.attachment-panel, .failure-panel, .report-card, .quality-panel { margin-top: 16px; padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.14); background: rgba(255,255,255,0.035); }
.failure-actions { margin-top: 10px; display: flex; align-items: center; gap: 10px; }
.retry-exhausted { color: var(--text-muted); font-size: 12px; font-style: italic; }
.attachment-panel strong, .failure-panel strong, .report-card strong, .quality-panel strong { color: #f8fafc; word-break: break-word; }
.report-card { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
.report-card > div:first-child { flex: 1 1 200px; min-width: 0; }
.quality-panel { display: flex; flex-direction: column; gap: 12px; }
.quality-panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.quality-panel-head span { font-size: 12px; color: #94a3b8; }
.quality-check-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.quality-check { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 12px; background: var(--surface-muted); color: var(--text-secondary); }
.quality-check.passed { color: #047857; background: rgba(16, 185, 129, 0.08); }
.quality-check-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
.quality-check.passed .quality-check-dot { background: #10b981; }
.quality-check strong { display: block; font-size: 12px; color: inherit; }
.quality-check p { margin: 2px 0 0; font-size: 11px; color: inherit; opacity: 0.8; }
.chat-composer { margin: 10px; padding: 12px; background: rgba(12, 14, 20, 0.98); border-radius: 16px; }
.composer-prompt-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 650;
}
.composer-prompt-header div {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.composer-prompt-header strong {
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: #9ca3af;
  background: rgba(255,255,255,0.035);
  font-size: 11px;
  font-weight: 600;
}
.draft-bar { display: flex; gap: 12px; flex-wrap: wrap; color: #94a3b8; font-size: 12px; margin-bottom: 12px; }
.selected-file-list { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.selected-file-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--surface-strong); color: var(--text-secondary); max-width: 100%; border: 1px solid transparent; transition: all 0.2s; }
.selected-file-pill:hover { border-color: var(--border-soft); color: var(--text-main); }
.selected-file-pill.code-pill { background: rgba(64, 158, 255, 0.08); border-color: rgba(64, 158, 255, 0.2); }
.code-analyzing-hint { color: var(--primary); font-size: 12px; animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.file-icon { flex-shrink: 0; color: var(--text-muted); }
.file-name-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.btn-remove { background: transparent; border: none; cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; padding: 4px; border-radius: 50%; transition: background 0.2s, color 0.2s; flex-shrink: 0; margin-right: -6px; }
.btn-remove:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.user-input { width: 100%; min-height: 88px; resize: vertical; border: 1px solid rgba(148, 163, 184, 0.10); border-radius: 12px; background: rgba(255,255,255,0.024); color: #f8fafc; font-size: 15px; line-height: 1.8; outline: none; padding: 12px; }
.user-input:focus { border-color: rgba(226, 232, 240, 0.28); background: rgba(255,255,255,0.04); }
.user-input::placeholder { color: #64748b; }
.composer-actions { margin-top: 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; }
.format-conflict-notice { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(245, 158, 11, 0.10); color: #fbbf24; font-size: 12px; line-height: 1.5; border: 1px solid rgba(245, 158, 11, 0.16); }
.btn-with-icon { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.composer-error { color: #f87171; font-size: 13px; }
.citation-style-select { font-size: 12px; padding: 6px 9px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; background: rgba(18, 21, 30, 0.96); color: #d1d5db; cursor: pointer; outline: none; }
.citation-style-select:focus { border-color: rgba(226, 232, 240, 0.30); box-shadow: 0 0 0 2px rgba(226, 232, 240, 0.08); }
.word-count-label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #cbd5e1; }
.word-count-text { white-space: nowrap; }
.word-count-input { width: 86px; font-size: 12px; padding: 6px 8px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; background: rgba(18, 21, 30, 0.96); color: #f8fafc; outline: none; }
.authors-input { width: 132px; font-size: 12px; padding: 6px 8px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; background: rgba(18, 21, 30, 0.96); color: #f8fafc; outline: none; }
.word-count-input:focus,
.authors-input:focus { border-color: rgba(226, 232, 240, 0.30); box-shadow: 0 0 0 2px rgba(226, 232, 240, 0.08); }
.word-count-input::placeholder { color: #9ca3af; font-size: 12px; }
.hidden-input { display: none; }
.loader-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; }
.loader-wrapper.small { flex: 1; min-height: 120px; height: 100%; }
.loader-wrapper.large { flex: 1; min-height: 300px; height: 100%; }

.run-pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
  background: rgba(148, 163, 184, 0.08);
  font-size: 12px;
  font-weight: 700;
}
.run-pill-active { color: #f8fafc; background: rgba(248, 250, 252, 0.10); border-color: rgba(248, 250, 252, 0.28); }
.run-pill-success { color: #86efac; background: rgba(34, 197, 94, 0.14); border-color: rgba(34, 197, 94, 0.32); }
.run-pill-danger { color: #fca5a5; background: rgba(239, 68, 68, 0.14); border-color: rgba(239, 68, 68, 0.32); }

.codex-empty-state {
  margin: auto;
  max-width: 720px;
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 18px;
  padding: 28px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.032);
}
.empty-orb {
  width: 74px;
  height: 74px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #f8fafc;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.16), rgba(148, 163, 184, 0.10));
  border: 1px solid rgba(248, 250, 252, 0.18);
}
.empty-eyebrow {
  margin: 0 0 8px !important;
  color: #cbd5e1 !important;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}
.codex-empty-state h2 {
  margin: 0 0 10px;
  color: #f8fafc;
  line-height: 1.35;
  font-size: 22px;
}
.codex-empty-state p {
  margin: 0;
  color: #94a3b8;
  line-height: 1.75;
}
.empty-quickstarts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.empty-quickstarts span {
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
  background: rgba(255,255,255,0.036);
  font-size: 12px;
}

.codex-inspector {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}
.inspector-card {
  padding: 14px;
  border-radius: 16px;
}
.hero-card {
  background:
    radial-gradient(circle at 90% 0%, rgba(226, 232, 240, 0.12), transparent 38%),
    rgba(15, 23, 42, 0.94);
}
.inspector-eyebrow {
  color: #cbd5e1;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.inspector-card h2 {
  margin: 8px 0;
  color: #f8fafc;
}
.inspector-card p,
.muted-copy {
  margin: 0;
  color: #94a3b8;
  line-height: 1.6;
  font-size: 13px;
}
.inspector-progress {
  height: 7px;
  margin: 14px 0;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.15);
}
.inspector-progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #f8fafc, #9ca3af);
}
.inspector-meta,
.inspector-section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.inspector-meta {
  padding-top: 8px;
  color: #94a3b8;
  font-size: 12px;
}
.inspector-meta strong,
.inspector-section-title span {
  color: #e5e7eb;
}
.inspector-section-title {
  margin-bottom: 12px;
  font-weight: 700;
}
.inspector-section-title small {
  color: #94a3b8;
}
.stage-stack,
.mini-quality-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.stage-row,
.mini-quality-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(148, 163, 184, 0.10);
}
.stage-row strong,
.mini-quality-row strong {
  color: #e5e7eb;
  font-size: 13px;
}
.stage-row p,
.mini-quality-row p {
  margin-top: 2px;
  font-size: 12px;
}
.stage-dot,
.mini-quality-row > span {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #64748b;
  flex-shrink: 0;
}
.stage-row.active .stage-dot {
  background: #f8fafc;
  box-shadow: 0 0 0 5px rgba(248, 250, 252, 0.10);
}
.stage-row.done .stage-dot,
.mini-quality-row.passed > span {
  background: #22c55e;
}
.artifact-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.artifact-chip {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255,255,255,0.035);
  color: #64748b;
  border-radius: 11px;
  padding: 9px 6px;
  font-size: 12px;
  cursor: not-allowed;
}
.artifact-chip.ready {
  color: #f8fafc;
  background: rgba(248, 250, 252, 0.10);
  border-color: rgba(248, 250, 252, 0.22);
  cursor: pointer;
}
.preview-cta {
  width: 100%;
  border: 1px solid rgba(248, 250, 252, 0.20);
  border-radius: 14px;
  padding: 12px;
  color: #f8fafc;
  background: rgba(248, 250, 252, 0.08);
  cursor: pointer;
}

@media (max-width: 1400px) {
  .chat-console { grid-template-columns: 240px minmax(420px, 1fr) 320px; }
  .chat-console.preview-open { grid-template-columns: minmax(420px, 1fr) minmax(480px, 46vw); }
  .chat-console.preview-open .chat-sidebar { display: none; }
}
@media (max-width: 1080px) {
  .chat-console {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
    overflow: auto;
  }
  .chat-sidebar { width: 100%; min-height: 160px; flex-shrink: 0; }
  .codex-inspector { min-height: 320px; }
  .global-preview-panel {
    position: fixed; top: 20px; right: 20px; bottom: 20px; left: 20px;
    width: auto; max-width: none; z-index: 100; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  }
}
@media (max-width: 720px) {
  .result-card, .user-card { width: 100%; }
}

/* ── Inline Clarification Styles ── */
.inline-user-card {
  display: flex; justify-content: flex-end; padding: 8px 0;
}
.inline-user-card .inline-user-bubble {
  max-width: 75%; padding: 10px 16px; border-radius: 18px 18px 4px 18px;
  background: var(--primary, #818cf8); color: #fff;
  font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.inline-answer-card {
  display: flex; justify-content: flex-end; padding: 6px 0;
}
.inline-answer-card .inline-answer-bubble {
  max-width: 75%; padding: 8px 14px; border-radius: 14px 14px 4px 14px;
  background: var(--surface-strong, #e0e7ff); color: var(--text-main, #1e293b);
  font-size: 13px; line-height: 1.5; white-space: pre-wrap;
}
.inline-answer-card .inline-answer-bubble .answer-label {
  font-size: 11px; color: var(--text-muted, #94a3b8); margin-bottom: 2px;
}
.inline-progress-card {
  display: flex; justify-content: center; padding: 6px 0;
}
.inline-progress-card .progress-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 14px; border-radius: 12px;
  background: var(--surface-muted, #f1f5f9); color: var(--text-secondary, #64748b);
  font-size: 12px;
}
.inline-progress-card .progress-pill .progress-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #818cf8;
  animation: pulseDot 1.4s infinite ease-in-out;
}
@keyframes pulseDot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.inline-typing-indicator {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 0;
}
.typing-dots {
  display: flex; gap: 4px; padding: 8px 14px;
  background: var(--surface, #f8fafc); border-radius: 16px;
  border: 1px solid var(--border-soft, #e2e8f0);
}
.typing-dots span {
  width: 7px; height: 7px; border-radius: 50%;
  background: #818cf8; animation: typingBounce 1.4s infinite ease-in-out;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6px); opacity: 1; }
}
.clarify-active-hint {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; font-size: 13px;
  color: #cbd5e1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 10px; margin-bottom: 8px;
}
.hint-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 0 0 5px rgba(248, 250, 252, 0.08);
  flex-shrink: 0;
}
.composer-disabled .user-input,
.composer-disabled .composer-actions { pointer-events: none; opacity: 0.5; }

/* Codex Desktop polish: flatter dark surfaces, compact rails, command-style composer. */
.chat-console {
  grid-template-columns: 252px minmax(560px, 1fr) 316px;
  gap: 8px;
  padding: 8px;
  background:
    radial-gradient(circle at 18% 0%, rgba(255,255,255,0.055), transparent 26%),
    radial-gradient(circle at 88% 16%, rgba(255,255,255,0.04), transparent 30%),
    #07080b;
}

.chat-sidebar,
.chat-main,
.codex-inspector {
  border-color: #252832;
  background: rgba(12, 13, 18, 0.98);
  box-shadow: none;
}

.message-card,
.chat-composer,
.inspector-card {
  border-color: #272a34;
  background: rgba(17, 19, 26, 0.98);
  box-shadow: none;
}

.chat-sidebar {
  padding: 10px;
  gap: 10px;
}

.sidebar-brand {
  padding: 2px 2px 9px;
}

.window-dots span {
  width: 9px;
  height: 9px;
}

.chat-sidebar .new-chat-btn,
.chat-console .btn-primary {
  min-height: 38px;
  width: 100%;
  border: 1px solid #2d313c;
  border-radius: 8px;
  background: #171a21;
  color: #e5e7eb;
  box-shadow: none;
  font-size: 13px;
  font-weight: 650;
}

.chat-sidebar .new-chat-btn:hover,
.chat-console .btn-primary:hover {
  background: #20242d;
  border-color: #3a3f4c;
}

.thread-list {
  gap: 6px;
}

.thread-list li {
  min-height: 38px;
  border-radius: 8px;
  background: transparent;
}

.thread-main {
  padding: 10px 12px;
  font-size: 12px;
}

.search-input {
  height: 32px;
  border-radius: 8px;
  background: #101219;
}

.chat-topbar {
  min-height: 72px;
  padding: 14px 18px;
  background: rgba(7, 8, 11, 0.42);
}

.chat-topbar h1 {
  font-size: 16px;
}

.kicker,
.message-meta {
  color: #8b92a3;
  letter-spacing: 0.11em;
}

.topbar-actions .btn,
.chat-composer .btn,
.preview-cta {
  border: 1px solid #2d313c;
  background: #171a21;
  color: #e5e7eb;
  box-shadow: none;
}

.topbar-actions .btn:hover,
.chat-composer .btn:hover,
.preview-cta:hover {
  background: #20242d;
  border-color: #3a3f4c;
}

.chat-composer .btn-accent {
  width: auto;
  border-color: #e5e7eb;
  background: #f4f4f5;
  color: #09090b;
  font-weight: 750;
}

.chat-stage {
  padding: 0 8px;
}

.chat-scroll {
  gap: 14px;
  padding: 12px 6px;
}

.message {
  gap: 10px;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: #cbd5e1;
  background: #12141b;
}

.message-card {
  padding: 14px 16px;
  border-radius: 11px;
}

.message-card h2 {
  font-size: 18px;
}

.message-card p {
  font-size: 14px;
  line-height: 1.65;
}

.user-card {
  width: min(860px, 100%);
  padding: 0 0 0 14px;
  border: 0;
  border-left: 2px solid rgba(148, 163, 184, 0.18);
  border-radius: 0;
  background: transparent;
}

.user-card .message-meta {
  margin-bottom: 8px;
}

.user-card p {
  color: #d7dce8;
  line-height: 1.65;
}

.result-card {
  width: min(820px, calc(100% - 42px));
}

.message-card.result-card {
  border-color: transparent;
  background: transparent;
  padding: 2px 0 0;
}

.message-card.result-card .message-meta {
  margin-bottom: 8px;
}

.message-card.result-card h2 {
  font-size: 15px;
  margin-bottom: 8px;
}

.message-card.result-card .progress-line {
  max-width: 76%;
  height: 5px;
  margin-top: 4px;
  background: rgba(148, 163, 184, 0.1);
}

.message-card.result-card .helper-text {
  margin-top: 8px;
  color: #7f8798;
}

.message-card.result-card .stage-badge {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.16);
  color: #aab3c5;
}

.message-card.result-card .activity-stop {
  height: 24px;
}

.attachment-panel,
.failure-panel,
.report-card,
.quality-panel {
  border-color: #2a2e39;
  background: #151821;
}

.chat-composer {
  margin: 8px;
  padding: 10px;
  border-radius: 13px;
}

.composer-prompt-header {
  margin-bottom: 7px;
}

.draft-bar {
  margin-bottom: 8px;
  color: #8b92a3;
}

.user-input {
  min-height: 76px;
  max-height: 180px;
  border-radius: 10px;
  background: #0e1016;
}

.composer-actions {
  margin-top: 10px;
  flex-wrap: nowrap;
  align-items: center;
}

.composer-left {
  min-width: 0;
  overflow: visible;
  flex-wrap: nowrap;
}

.composer-left .btn,
.citation-style-select,
.authors-input,
.word-count-input {
  height: 30px;
  flex: 0 0 auto;
  border-radius: 8px;
  white-space: nowrap;
}

.composer-left > label.btn span,
.composer-left > button.btn span {
  display: none;
}

.composer-left > label.btn,
.composer-left > button.btn {
  width: 32px;
  padding: 0;
}

.citation-style-select {
  max-width: 116px;
}

.authors-input {
  width: 92px;
}

.composer-options {
  position: relative;
  flex: 0 0 auto;
}

.composer-options summary {
  list-style: none;
  cursor: pointer;
}

.composer-options summary::-webkit-details-marker {
  display: none;
}

.composer-options-panel {
  position: absolute;
  left: 0;
  bottom: 38px;
  z-index: 20;
  width: min(420px, calc(100vw - 48px));
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  background: rgba(12, 14, 20, 0.98);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.38);
}

.composer-options-panel label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: #7f8798;
  font-size: 11px;
}

.composer-options-panel select,
.composer-options-panel input,
.composer-options-panel .citation-style-select,
.composer-options-panel .authors-input,
.composer-options-panel .word-count-input {
  width: 100%;
  max-width: none;
}

.composer-options-panel :deep(.template-selector) {
  width: 100%;
}

.word-count-label {
  flex: 0 0 auto;
}

.inspector-card {
  border-radius: 12px;
  padding: 12px;
}

.hero-card {
  background:
    radial-gradient(circle at 90% 0%, rgba(255,255,255,0.08), transparent 40%),
    #101421;
}

.stage-row,
.mini-quality-row {
  border-color: transparent;
  background: transparent;
  padding: 7px 2px;
  border-radius: 0;
}

.stage-row strong,
.mini-quality-row strong {
  font-size: 12px;
}

.stage-row p,
.mini-quality-row p {
  font-size: 11px;
}

.codex-inspector {
  background: #080a0f;
}

.codex-inspector .inspector-card {
  border: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 14px 12px;
}

.codex-inspector .hero-card {
  background: transparent;
}

.codex-inspector .hero-card h2 {
  font-size: 22px;
}

.codex-inspector .inspector-meta {
  padding: 5px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}

.codex-inspector .stage-stack,
.codex-inspector .mini-quality-list {
  gap: 0;
}

.codex-inspector .stage-row + .stage-row,
.codex-inspector .mini-quality-row + .mini-quality-row {
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}

.codex-inspector .artifact-grid {
  gap: 6px;
}

.codex-inspector .artifact-chip {
  height: 28px;
  border-radius: 7px;
  background: #0d1016;
}

.codex-inspector .preview-cta {
  margin: 10px 12px 0;
  width: calc(100% - 24px);
  border-color: rgba(148, 163, 184, 0.16);
  background: #0d1016;
}

.artifact-chip {
  border-color: #282c36;
  background: #141720;
}

:deep(.clarify-msg-body),
:deep(.summary-card),
:deep(.task-card-inline) {
  border-color: #272a34 !important;
  background: #11131a !important;
  box-shadow: none !important;
  color: #e5e7eb !important;
}

:deep(.clarify-msg-avatar),
:deep(.summary-card-avatar) {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border-color: #272a34;
  background: #12141b;
  color: #cbd5e1;
}

:deep(.clarify-pill),
:deep(.summary-btn),
:deep(.tc-detail-btn) {
  border-color: #2d313c !important;
  background: #171a21 !important;
  color: #e5e7eb !important;
}

:deep(.clarify-pill:not(.disabled):hover),
:deep(.summary-btn:hover),
:deep(.tc-detail-btn:hover) {
  background: #20242d !important;
  border-color: #3a3f4c !important;
}
</style>
