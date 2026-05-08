<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getUserInfo, logout as apiLogout } from '@/features/auth/api/auth';
import { forceDeleteSessionAsAdmin } from '@/features/admin/api/admin';
import { deleteFile, uploadFile } from '@/features/workspace/api/file';
import {
  createSession,
  deleteSession,
  getSessionAttachments,
  getSessionWorkspace,
  getSessions,
  uploadSessionAttachment,
  updateSession,
} from '@/features/workspace/api/session';
import {
  createTaskProgressStream,
  downloadTaskReport,
  submitGenerateTask,
  getTaskStatus,
  retryTask,
  cancelTask,
  checkClarification,
  refineClarification,
  previewOutline,
  getActiveTask,
  extractDocumentInfo,
  clarifyNext,
  clarifyAnswer,
  clarifySkip as clarifySkipApi,
  clarifyFinish,
} from '@/features/workspace/api/task';
import { useUserStore } from '@/features/auth/stores/user';
import { useWorkspaceStore } from '@/features/workspace/stores/workspace';
import { explainTaskFailure } from '@/features/workspace/utils/task-failure';
import WorkspaceChatConsole from '@/features/workspace/components/WorkspaceChatConsole.vue';
import ClarificationChat from '@/features/workspace/components/ClarificationChat.vue';
import SafetyBlockModal from '@/features/workspace/components/SafetyBlockModal.vue';
import ArchiveUpload from '@/features/workspace/components/ArchiveUpload.vue';
import { buildAttachmentSnapshotFromFiles } from '@/features/workspace/utils/task-attachments';

const router = useRouter();
const userStore = useUserStore();
const workspaceStore = useWorkspaceStore();

const loading = reactive({
  bootstrap: false,
  session: false,
  upload: false,
  attachments: false,
  task: false,
  workspace: false
});

const downloadStatesByTaskId = ref({});
const downloadStates = reactive(createEmptyDownloadState());

const flash = reactive({
  type: '',
  text: ''
});

const WORKSPACE_STORAGE_PREFIX = 'workspaceState';
const AUDIT_TRIGGER_HEADER = 'X-Audit-Trigger';
const AUDIT_TRIGGER_SOURCE = {
  USER_ACTION: 'USER_ACTION',
  AUTO_REFRESH: 'AUTO_REFRESH'
};

// Clarification state (client-local, no server persistence)
const clarifyState = reactive({
  active: false,
  loading: false,
  questions: [],
  answers: {},
  refinedRequirement: null,
  safetyWarning: null,
});
let _lastClarifyInput = '';

// Progressive clarification state
const progressiveClarify = reactive({
  active: false,
  topic: '',
});
const clarificationChatRef = ref(null);

// Inline clarification state (replaces progressive popup)
const inlineClarify = reactive({
  active: false,
  processing: false,
  messages: [],
  history: [],
  documentInfo: null,
  topic: '',
  savedUserInput: '',
  currentQuestion: null,
  step: 0,
});
let _inlineMsgCounter = 0;
function _nextMsgId() { return `icm-${++_inlineMsgCounter}-${Date.now()}`; }

// Reconnection banner state
const reconnecting = reactive({
  active: false,
  attempt: 0,
  message: '',
});

// Outline preview state
const outlinePreview = reactive({
  active: false,
  loading: false,
  sections: [],
  editedSections: [],
});

const sessions = computed({
  get: () => workspaceStore.sessions,
  set: (val) => { workspaceStore.sessions = val; }
});
const files = ref([]);
const sessionDetailsBySessionId = computed({
  get: () => workspaceStore.sessionDetailsBySessionId,
  set: (val) => { workspaceStore.sessionDetailsBySessionId = val; }
});
const sessionTaskListBySessionId = computed({
  get: () => workspaceStore.sessionTaskListBySessionId,
  set: (val) => { workspaceStore.sessionTaskListBySessionId = val; }
});
const selectedSessionId = computed({
  get: () => workspaceStore.selectedSessionId,
  set: (val) => { workspaceStore.selectedSessionId = val; }
});
const selectedFileIdsBySessionId = ref({});
const taskSnapshotsBySessionId = ref({});
const currentTaskIdBySessionId = ref({});
const taskCodesBySessionId = ref({});
const taskFormsBySessionId = ref({});
const taskGenerationMode = ref('paper_format_to_paper');
const taskVenueLabel = ref('IEEE');
const taskVenueVariant = ref('conference');
const taskAuthors = ref('');
const taskControlMode = ref('batch_autopilot');
const pendingTaskSessionId = ref('');
const taskTimer = ref(null);
const pollingSessionId = ref('');
const taskStream = shallowRef(null);
const streamingTaskId = ref('');
const streamingSessionId = ref('');
const streamFallbackTaskIdBySessionId = ref({});
const workspaceStateReady = ref(false);

// ─── Real-time preview streaming state ──────────────────────
const streamingSections = ref([]);
const streamingContentTaskId = ref('');

function handleContentEvent(payload) {
  const { sectionIndex, sectionTitle, paragraphs, totalSections, taskId } = payload;
  if (taskId) {
    streamingContentTaskId.value = taskId;
  }
  const existing = streamingSections.value.find((s) => s.sectionIndex === sectionIndex);
  if (existing) {
    existing.paragraphs = paragraphs || [];
    existing.done = true;
  } else {
    streamingSections.value.push({
      sectionIndex,
      sectionTitle: sectionTitle || `章节 ${sectionIndex + 1}`,
      paragraphs: paragraphs || [],
      done: true,
    });
    streamingSections.value.sort((a, b) => a.sectionIndex - b.sectionIndex);
  }
}

function clearStreamingSections() {
  streamingSections.value = [];
  streamingContentTaskId.value = '';
}

const isStreamingContent = computed(() => {
  return currentTaskTone.value === 'active' && streamingSections.value.length > 0;
});

// SSE debounce: batch rapid progress events into single reactive updates
const pendingSSEUpdates = new Map();
let sseFlushTimer = null;
const SSE_FLUSH_INTERVAL = 200; // ms — flush at most 5 times/sec

function flushSSEUpdates() {
  sseFlushTimer = null;
  if (pendingSSEUpdates.size === 0) return;

  const updates = new Map(pendingSSEUpdates);
  pendingSSEUpdates.clear();

  for (const [, { sessionId, taskSnapshot }] of updates) {
    setTaskSnapshot(sessionId, taskSnapshot, inferTaskCodeFromSnapshot(taskSnapshot));
    const mergedTaskSnapshot = (taskSnapshotsBySessionId.value[sessionId] || [])
      .find((item) => item?.taskId === taskSnapshot.taskId) || taskSnapshot;
    upsertSessionTaskSummary(sessionId, mergedTaskSnapshot);
  }
}

function scheduleSSEFlush() {
  if (sseFlushTimer !== null) return;
  sseFlushTimer = window.setTimeout(flushSSEUpdates, SSE_FLUSH_INTERVAL);
}

const showSafetyBlockModal = ref(false);
const safetyBlockData = ref(null);

function getSafetyDetectedKeywords(data) {
  if (!Array.isArray(data?.detected_keywords)) {
    return [];
  }
  return data.detected_keywords
    .map((keyword) => typeof keyword === 'string' ? keyword.trim() : '')
    .filter(Boolean);
}

function buildSafetyBlockMessage(error) {
  const detectedKeywords = getSafetyDetectedKeywords(error?.data);
  if (detectedKeywords.length > 0) {
    return `检测到违禁词: ${detectedKeywords.slice(0, 3).join(', ')}`;
  }

  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : '';
  if (rawMessage && !/需要审核|涉及类别|词库/.test(rawMessage)) {
    return rawMessage;
  }

  return '检测到敏感或违禁内容，请修改后重新提交。';
}

function isSafetyBlockError(error) {
  if (error?.code !== 403 || !error?.data || typeof error.data !== 'object') {
    return false;
  }
  const action = String(error.data.action || '').toLowerCase();
  if (action === 'block' || action === 'review') {
    return true;
  }
  return getSafetyDetectedKeywords(error.data).length > 0;
}

function handleSafetyBlockDecision(decision) {
  showSafetyBlockModal.value = false;
  safetyBlockData.value = null;
  if (decision === 'abandon') {
    taskUserInput.value = '';
    taskOutline.value = '';
    selectedTemplateFile.value = null;
    selectedApiTemplate.value = null;
    codeFiles.value = [];
    codeAnalysis.value = null;
  }
}

const sessionForm = reactive({
  title: ''
});

const taskUserInput = ref('');
const taskOutline = ref('');
const taskCitationStyle = ref('gb');
const taskTargetWordCount = ref(null);
const selectedTemplateFile = ref(null);
const selectedApiTemplate = ref(null);
const codeFiles = ref([]);
const codeAnalysis = ref(null);
const codeAnalyzing = ref(false);

// Archive upload state
const archiveUploadVisible = ref(false);
const archiveAnalysis = ref(null);

// Reset stale clarification when user changes input
watch(taskUserInput, (val) => {
  if (val !== _lastClarifyInput && clarifyState.refinedRequirement) {
    clarifyState.refinedRequirement = null;
    clarifyState.questions = [];
    clarifyState.answers = {};
    clarifyState.safetyWarning = null;
  }
});

const activeSession = computed(() =>
  sessions.value.find((item) => item.sessionId === selectedSessionId.value) || null
);

const currentUser = computed(() => userStore.userInfo || {});
const currentSessionDetail = computed(() => {
  if (!selectedSessionId.value) {
    return null;
  }
  return sessionDetailsBySessionId.value[selectedSessionId.value] || activeSession.value || null;
});
const currentTaskSnapshots = computed(() => {
  if (!selectedSessionId.value) {
    return [];
  }
  return taskSnapshotsBySessionId.value[selectedSessionId.value] || [];
});
const selectedFileIds = computed(() => {
  if (!selectedSessionId.value) {
    return [];
  }
  return selectedFileIdsBySessionId.value[selectedSessionId.value] || [];
});
const selectedFiles = computed(() =>
  files.value.filter((item) => selectedFileIds.value.includes(item.fileId))
);
const currentTask = computed(() => {
  if (!currentTaskSnapshots.value.length) {
    return null;
  }
  const currentTaskId = currentTaskIdBySessionId.value[selectedSessionId.value];
  if (currentTaskId) {
    const matchedTask = currentTaskSnapshots.value.find((item) => item.taskId === currentTaskId);
    if (matchedTask) {
      return matchedTask;
    }
  }
  return selectCurrentTaskSnapshotFromList(currentTaskSnapshots.value);
});
const currentTaskCode = computed(() => {
  return inferTaskCodeFromSnapshot(currentTask.value);
});
const currentSessionTasks = computed(() => {
  if (!selectedSessionId.value) {
    return [];
  }
  return sessionTaskListBySessionId.value[selectedSessionId.value] || [];
});
const taskHistory = computed(() => [...currentTaskSnapshots.value].sort(compareTaskSnapshotsByCreatedAtAsc));
const recentTaskHistory = computed(() => currentSessionTasks.value.slice(0, 6));
const currentTaskProgress = computed(() => Math.max(0, Math.min(currentTask.value?.progress ?? 0, 100)));
const currentTaskTone = computed(() => {
  const status = String(currentTask.value?.status || '').toLowerCase();
  if (['completed', 'success', 'succeeded'].includes(status)) {
    return 'success';
  }
  if (['failed', 'error', 'cancelled'].includes(status)) {
    return 'danger';
  }
  if (['running', 'processing', 'queued', 'pending'].includes(status)) {
    return 'active';
  }
  return 'idle';
});
const currentTaskFailure = computed(() => explainTaskFailure(currentTask.value, currentTaskCode.value));
const canDownloadCurrentTask = computed(() => hasDownloadableTaskResult(currentTask.value));
const sessionFormError = computed(() => {
  if (!sessionForm.title.trim()) {
    return '请输入会话标题。';
  }
  return '';
});
const taskFormError = computed(() => {
  if (!selectedSessionId.value) {
    return '请先创建或选择一个会话。';
  }
  if (!taskUserInput.value.trim()) {
    return '请输入研究需求。';
  }
  return '';
});
const isCreateSessionDisabled = computed(() => loading.session || Boolean(sessionFormError.value));
const isCreateTaskDisabled = computed(() => loading.task || Boolean(taskFormError.value));

function setFlash(type, text) {
  flash.type = type;
  flash.text = text;
}

const _LLM_ERROR_CODES = new Set([
  'LLM_CONFIG_ERROR', 'LLM_GENERATION_ERROR', 'LLM_RATE_LIMIT',
]);
function _isLLMError(e) {
  return _LLM_ERROR_CODES.has(e?.code) || _LLM_ERROR_CODES.has(e?.payload?.code);
}
function _llmFlashMessage(e) {
  const code = e?.code || e?.payload?.code;
  if (code === 'LLM_CONFIG_ERROR') return '模型服务未配置，请联系管理员设置 API 密钥';
  if (code === 'LLM_RATE_LIMIT') return '请求过于频繁，请稍后重试';
  return e?.message || '模型服务暂时不可用，请稍后重试';
}

function clearFlash() {
  flash.type = '';
  flash.text = '';
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

function createEmptyDownloadState() {
  return {
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

function withAuditTrigger(triggerSource = AUDIT_TRIGGER_SOURCE.USER_ACTION, config = {}) {
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      [AUDIT_TRIGGER_HEADER]: triggerSource
    }
  };
}

function normalizeFileIdList(fileIds) {
  if (!Array.isArray(fileIds)) {
    return [];
  }

  return [...new Set(fileIds
    .map((fileId) => (typeof fileId === 'string' ? fileId.trim() : ''))
    .filter(Boolean))];
}

function normalizeSessionAttachmentFile(file) {
  if (!file || typeof file !== 'object') {
    return null;
  }

  const fileId = typeof file.fileId === 'string' ? file.fileId.trim() : '';
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';

  if (!fileId && !fileName) {
    return null;
  }

  return {
    ...file,
    fileId,
    fileName: fileName || '未命名附件',
    fileType: typeof file.fileType === 'string' ? file.fileType.trim() : '',
    expiresAt: file.expiresAt || file.availableUntil || null
  };
}

function normalizeSessionAttachmentList(attachments) {
  const rawAttachments = Array.isArray(attachments) ? attachments : [];
  const seenFileIds = new Set();
  return rawAttachments
    .map((file) => normalizeSessionAttachmentFile(file))
    .filter((file) => {
      if (!file) {
        return false;
      }
      if (!file.fileId) {
        return true;
      }
      if (seenFileIds.has(file.fileId)) {
        return false;
      }
      seenFileIds.add(file.fileId);
      return true;
    });
}

function inferTaskTemplateFileType(fileType, fileName = '') {
  const normalizedType = typeof fileType === 'string' ? fileType.trim().toLowerCase() : '';

  if (normalizedType) {
    if (normalizedType === 'pdf' || normalizedType.endsWith('/pdf')) {
      return 'pdf';
    }
    if (normalizedType === 'docx' || normalizedType.includes('wordprocessingml.document')) {
      return 'docx';
    }
    if (!normalizedType.includes('/')) {
      return normalizedType.replace(/^\./, '') || null;
    }
  }

  const extensionMatch = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return extensionMatch?.[1] || null;
}

function buildTaskTemplateSnapshot(file) {
  if (!file || typeof file !== 'object') {
    return {
      templateFileId: null,
      templateFileName: null,
      templateFileType: null
    };
  }

  const templateFileId = typeof file.fileId === 'string' ? file.fileId.trim() : '';
  const templateFileName = typeof file.fileName === 'string'
    ? file.fileName.trim()
    : typeof file.name === 'string'
      ? file.name.trim()
      : '';
  const templateFileType = inferTaskTemplateFileType(
    typeof file.fileType === 'string' ? file.fileType : file.type,
    templateFileName
  );

  return {
    templateFileId: templateFileId || null,
    templateFileName: templateFileName || null,
    templateFileType: templateFileType || null
  };
}

function getCurrentSessionAttachmentIds(attachments = files.value) {
  return new Set(normalizeSessionAttachmentList(attachments).map((file) => file.fileId).filter(Boolean));
}

function inferTaskCodeFromSnapshot(taskSnapshot) {
  const status = String(taskSnapshot?.status || '').toLowerCase();
  if (['pending', 'processing', 'running', 'queued'].includes(status)) {
    return 202;
  }
  if (['failed', 'error', 'cancelled'].includes(status)) {
    return 500;
  }
  return 200;
}

function hasDownloadableTaskResult(taskSnapshot) {
  const status = String(taskSnapshot?.status || '').toLowerCase();
  if (status !== 'completed' || !taskSnapshot?.taskId) {
    return false;
  }
  return Boolean(taskSnapshot?.resultFileId || taskSnapshot?.resultMarkdown?.trim());
}

function toTaskTimestamp(taskSnapshot) {
  const rawValue = taskSnapshot?.createdAt || taskSnapshot?.updatedAt || taskSnapshot?.completedAt;
  if (!rawValue) {
    return 0;
  }
  const timestamp = new Date(rawValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareTaskSnapshotsByCreatedAtDesc(left, right) {
  return toTaskTimestamp(right) - toTaskTimestamp(left);
}

function compareTaskSnapshotsByCreatedAtAsc(left, right) {
  return toTaskTimestamp(left) - toTaskTimestamp(right);
}

function isActiveTaskStatus(status) {
  return ['pending', 'processing', 'running', 'queued'].includes(String(status || '').toLowerCase());
}

function isTerminalTaskStatus(status) {
  return ['completed', 'success', 'succeeded', 'failed', 'error', 'cancelled'].includes(
    String(status || '').toLowerCase()
  );
}

function selectCurrentTaskSnapshotFromList(taskSnapshots) {
  if (!Array.isArray(taskSnapshots) || !taskSnapshots.length) {
    return null;
  }
  return taskSnapshots.find((item) => isActiveTaskStatus(item?.status))
    || taskSnapshots.find((item) => ['completed', 'success', 'succeeded'].includes(String(item?.status || '').toLowerCase()))
    || taskSnapshots.find((item) => ['failed', 'error', 'cancelled'].includes(String(item?.status || '').toLowerCase()))
    || taskSnapshots[0]
    || null;
}

function getDownloadStatesForTask(taskId) {
  if (!taskId) {
    return createEmptyDownloadState();
  }
  return downloadStatesByTaskId.value[taskId] || createEmptyDownloadState();
}

function setDownloadStateForTask(taskId, format, value) {
  if (!taskId) {
    return;
  }
  downloadStatesByTaskId.value = {
    ...downloadStatesByTaskId.value,
    [taskId]: {
      ...getDownloadStatesForTask(taskId),
      [format]: value
    }
  };
}

function safeReadJson(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function getWorkspaceStorageKey() {
  const userId = currentUser.value?.userId;
  return userId ? `${WORKSPACE_STORAGE_PREFIX}:${userId}` : '';
}

function clearTaskPolling() {
  if (taskTimer.value) {
    window.clearInterval(taskTimer.value);
    taskTimer.value = null;
  }
  pollingSessionId.value = '';
}

function clearTaskStream() {
  if (taskStream.value && typeof taskStream.value.close === 'function') {
    taskStream.value.close();
  }
  taskStream.value = null;
  streamingTaskId.value = '';
  streamingSessionId.value = '';
}

function clearTaskTransport() {
  clearTaskStream();
  clearTaskPolling();
}

function clearTaskTransportForSession(sessionId) {
  if (!sessionId) {
    return;
  }
  if (streamingSessionId.value === sessionId) {
    clearTaskStream();
  }
  if (pollingSessionId.value === sessionId) {
    clearTaskPolling();
  }
}

function setTaskStreamFallback(sessionId, taskId) {
  if (!sessionId) {
    return;
  }

  streamFallbackTaskIdBySessionId.value = {
    ...streamFallbackTaskIdBySessionId.value,
    [sessionId]: taskId || ''
  };
}

function clearTaskStreamFallback(sessionId, taskId = null) {
  if (!sessionId) {
    return;
  }

  const existingTaskId = streamFallbackTaskIdBySessionId.value[sessionId];
  if (taskId && existingTaskId && existingTaskId !== taskId) {
    return;
  }

  const nextFallbackTaskIdBySessionId = { ...streamFallbackTaskIdBySessionId.value };
  delete nextFallbackTaskIdBySessionId[sessionId];
  streamFallbackTaskIdBySessionId.value = nextFallbackTaskIdBySessionId;
}

function parseTaskProgressEvent(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }

  try {
    const payload = JSON.parse(rawValue);
    if (!payload || typeof payload !== 'object' || !payload.taskId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function restoreWorkspaceState() {
  const storageKey = getWorkspaceStorageKey();
  if (!storageKey) {
    return;
  }

  const savedState = safeReadJson(localStorage.getItem(storageKey), {});
  selectedSessionId.value = savedState.selectedSessionId || '';
  taskFormsBySessionId.value = savedState.taskFormsBySessionId || {};
}

function persistWorkspaceState() {
  if (!workspaceStateReady.value) {
    return;
  }

  const storageKey = getWorkspaceStorageKey();
  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify({
    selectedSessionId: selectedSessionId.value,
    taskFormsBySessionId: taskFormsBySessionId.value
  }));
}

function pruneWorkspaceState() {
  const validSessionIds = new Set(sessions.value.map((item) => item.sessionId));
  const nextSelectedFileIdsBySessionId = {};
  const nextTaskSnapshotsBySessionId = {};
  const nextCurrentTaskIdBySessionId = {};
  const nextTaskCodesBySessionId = {};

  for (const [sessionId, fileIds] of Object.entries(selectedFileIdsBySessionId.value)) {
    if (!validSessionIds.has(sessionId)) {
      continue;
    }
    nextSelectedFileIdsBySessionId[sessionId] = normalizeFileIdList(fileIds);
  }

  for (const [sessionId, taskSnapshots] of Object.entries(taskSnapshotsBySessionId.value)) {
    if (!validSessionIds.has(sessionId)) {
      continue;
    }
    nextTaskSnapshotsBySessionId[sessionId] = Array.isArray(taskSnapshots)
      ? [...taskSnapshots.filter(Boolean)].sort(compareTaskSnapshotsByCreatedAtDesc)
      : taskSnapshots
        ? [taskSnapshots]
        : [];
  }

  for (const [sessionId, taskId] of Object.entries(currentTaskIdBySessionId.value)) {
    if (!validSessionIds.has(sessionId) || !taskId) {
      continue;
    }
    nextCurrentTaskIdBySessionId[sessionId] = taskId;
  }

  for (const [sessionId, code] of Object.entries(taskCodesBySessionId.value)) {
    if (!validSessionIds.has(sessionId)) {
      continue;
    }
    nextTaskCodesBySessionId[sessionId] = code;
  }

  const nextTaskFormsBySessionId = {};
  for (const [sessionId, taskForm] of Object.entries(taskFormsBySessionId.value)) {
    if (!validSessionIds.has(sessionId)) {
      continue;
    }
    nextTaskFormsBySessionId[sessionId] = {
      userInput: taskForm?.userInput || '',
      outline: taskForm?.outline || '',
      generationMode: taskForm?.generationMode || 'paper_format_to_paper',
      venueLabel: taskForm?.venueLabel || 'IEEE',
      venueVariant: taskForm?.venueVariant || 'conference',
      authors: taskForm?.authors || '',
      controlMode: taskForm?.controlMode || 'batch_autopilot'
    };
  }

  selectedFileIdsBySessionId.value = nextSelectedFileIdsBySessionId;
  taskSnapshotsBySessionId.value = nextTaskSnapshotsBySessionId;
  currentTaskIdBySessionId.value = nextCurrentTaskIdBySessionId;
  taskCodesBySessionId.value = nextTaskCodesBySessionId;
  taskFormsBySessionId.value = nextTaskFormsBySessionId;

  if (selectedSessionId.value && !validSessionIds.has(selectedSessionId.value)) {
    selectedSessionId.value = '';
  }
}

function setSessionTasks(sessionId, tasks) {
  if (!sessionId) {
    return;
  }

  sessionTaskListBySessionId.value = {
    ...sessionTaskListBySessionId.value,
    [sessionId]: tasks
  };
}

function setSessionDetail(sessionId, sessionDetail) {
  if (!sessionId) {
    return;
  }

  sessionDetailsBySessionId.value = {
    ...sessionDetailsBySessionId.value,
    [sessionId]: sessionDetail
  };
}

function clearTaskSnapshotForSession(sessionId) {
  if (!sessionId) {
    return;
  }

  const nextTaskSnapshotsBySessionId = { ...taskSnapshotsBySessionId.value };
  delete nextTaskSnapshotsBySessionId[sessionId];
  taskSnapshotsBySessionId.value = nextTaskSnapshotsBySessionId;

  const nextCurrentTaskIdBySessionId = { ...currentTaskIdBySessionId.value };
  delete nextCurrentTaskIdBySessionId[sessionId];
  currentTaskIdBySessionId.value = nextCurrentTaskIdBySessionId;

  const nextTaskCodesBySessionId = { ...taskCodesBySessionId.value };
  delete nextTaskCodesBySessionId[sessionId];
  taskCodesBySessionId.value = nextTaskCodesBySessionId;
}

function setCurrentTaskIdForSession(sessionId, taskId) {
  if (!sessionId) {
    return;
  }

  if (!taskId) {
    const nextCurrentTaskIdBySessionId = { ...currentTaskIdBySessionId.value };
    delete nextCurrentTaskIdBySessionId[sessionId];
    currentTaskIdBySessionId.value = nextCurrentTaskIdBySessionId;
    return;
  }

  currentTaskIdBySessionId.value = {
    ...currentTaskIdBySessionId.value,
    [sessionId]: taskId
  };
}

function setTaskSnapshotsForSession(sessionId, taskSnapshots, code = null, currentTaskId = null) {
  if (!sessionId) {
    return;
  }

  const normalizedSnapshots = Array.isArray(taskSnapshots)
    ? taskSnapshots
      .filter(Boolean)
      .map((taskSnapshot) => ({ ...taskSnapshot }))
      .sort(compareTaskSnapshotsByCreatedAtDesc)
    : [];

  taskSnapshotsBySessionId.value = {
    ...taskSnapshotsBySessionId.value,
    [sessionId]: normalizedSnapshots
  };

  const selectedCurrentTask = currentTaskId
    ? normalizedSnapshots.find((item) => item.taskId === currentTaskId)
    : selectCurrentTaskSnapshotFromList(normalizedSnapshots);
  setCurrentTaskIdForSession(sessionId, selectedCurrentTask?.taskId || null);

  if (!normalizedSnapshots.length) {
    const nextTaskCodesBySessionId = { ...taskCodesBySessionId.value };
    delete nextTaskCodesBySessionId[sessionId];
    taskCodesBySessionId.value = nextTaskCodesBySessionId;
    return;
  }

  taskCodesBySessionId.value = {
    ...taskCodesBySessionId.value,
    [sessionId]: code ?? inferTaskCodeFromSnapshot(normalizedSnapshots[0])
  };
}

function applySessionWorkspace(sessionId, workspace) {
  if (!sessionId || !workspace) {
    return;
  }

  if (workspace.session) {
    setSessionDetail(sessionId, workspace.session);
  }
  setSessionTasks(sessionId, workspace.tasks || []);
  const workspaceTaskSnapshots = Array.isArray(workspace.taskSnapshots) && workspace.taskSnapshots.length
    ? workspace.taskSnapshots
    : Array.isArray(workspace.tasks)
      ? workspace.tasks
      : [];

  if (workspaceTaskSnapshots.length) {
    setTaskSnapshotsForSession(
      sessionId,
      workspaceTaskSnapshots,
      workspace.currentTaskCode ?? inferTaskCodeFromSnapshot(workspace.currentTask),
      workspace.currentTask?.taskId || null
    );
    return;
  }
  clearTaskSnapshotForSession(sessionId);
}

function buildTaskSummary(taskSnapshot) {
  return {
    taskId: taskSnapshot.taskId,
    sessionId: taskSnapshot.sessionId,
    userInput: taskSnapshot.userInput ?? null,
    outline: taskSnapshot.outline ?? null,
    templateFileId: taskSnapshot.templateFileId ?? null,
    templateFileName: taskSnapshot.templateFileName ?? null,
    templateFileType: taskSnapshot.templateFileType ?? null,
    resultFileId: taskSnapshot.resultFileId ?? null,
    resultFileName: taskSnapshot.resultFileName ?? null,
    resultFileType: taskSnapshot.resultFileType ?? null,
    status: taskSnapshot.status,
    progress: taskSnapshot.progress ?? null,
    currentSection: taskSnapshot.currentSection ?? null,
    totalSections: taskSnapshot.totalSections ?? null,
    errorMessage: taskSnapshot.errorMessage ?? null,
    errorCategory: taskSnapshot.errorCategory ?? null,
    createdAt: taskSnapshot.createdAt ?? null,
    updatedAt: taskSnapshot.updatedAt ?? null,
    completedAt: taskSnapshot.completedAt ?? null,
    usedFilesCount: taskSnapshot.usedFilesCount ?? 0,
    usedFiles: Array.isArray(taskSnapshot.usedFiles) ? taskSnapshot.usedFiles : [],
    submissionState: taskSnapshot.submissionState || 'notAttached'
  };
}

function getTaskCodeForSession(sessionId) {
  if (!sessionId) {
    return 200;
  }
  return taskCodesBySessionId.value[sessionId] ?? 200;
}

function getTaskSnapshotForSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  const taskSnapshots = taskSnapshotsBySessionId.value[sessionId] || [];
  const currentTaskId = currentTaskIdBySessionId.value[sessionId];
  if (currentTaskId) {
    const matchedTask = taskSnapshots.find((item) => item.taskId === currentTaskId);
    if (matchedTask) {
      return matchedTask;
    }
  }
  return selectCurrentTaskSnapshotFromList(taskSnapshots);
}

function upsertSessionTaskSummary(sessionId, taskSnapshot) {
  if (!sessionId || !taskSnapshot?.taskId) {
    return;
  }

  const existingTasks = sessionTaskListBySessionId.value[sessionId] || [];
  const nextTasks = [
    buildTaskSummary(taskSnapshot),
    ...existingTasks.filter((item) => item.taskId !== taskSnapshot.taskId)
  ];
  setSessionTasks(sessionId, nextTasks);
}

function setSelectedFileIdsForSession(sessionId, fileIds) {
  if (!sessionId) {
    return;
  }

  selectedFileIdsBySessionId.value = {
    ...selectedFileIdsBySessionId.value,
    [sessionId]: normalizeFileIdList(fileIds)
  };
}

function syncSelectedFileIdsWithAttachments(sessionId, attachments = files.value) {
  if (!sessionId) {
    return;
  }

  const attachmentIds = getCurrentSessionAttachmentIds(attachments);
  const currentFileIds = normalizeFileIdList(selectedFileIdsBySessionId.value[sessionId] || []);
  const nextFileIds = currentFileIds.filter((fileId) => attachmentIds.has(fileId));

  if (nextFileIds.length !== currentFileIds.length) {
    setSelectedFileIdsForSession(sessionId, nextFileIds);
  }
}

function removeDeletedFileSelections(fileId) {
  const nextSelectedFileIdsBySessionId = {};
  for (const [sessionId, fileIds] of Object.entries(selectedFileIdsBySessionId.value)) {
    nextSelectedFileIdsBySessionId[sessionId] = Array.isArray(fileIds)
      ? normalizeFileIdList(fileIds.filter((item) => item !== fileId))
      : [];
  }
  selectedFileIdsBySessionId.value = nextSelectedFileIdsBySessionId;
}

function setTaskSnapshot(sessionId, taskSnapshot, code, options = {}) {
  if (!sessionId) {
    return;
  }

  const existingTaskSnapshots = [...(taskSnapshotsBySessionId.value[sessionId] || [])];
  const replacePlaceholder = Boolean(options.replacePlaceholder);
  const cleanedTaskSnapshots = replacePlaceholder
    ? existingTaskSnapshots.filter((item) => item?.taskId)
    : existingTaskSnapshots;
  const taskId = taskSnapshot?.taskId || null;
  const matchingIndex = taskId
    ? cleanedTaskSnapshots.findIndex((item) => item?.taskId === taskId)
    : cleanedTaskSnapshots.findIndex((item) => !item?.taskId);
  const previousTaskSnapshot = matchingIndex >= 0 ? cleanedTaskSnapshots[matchingIndex] : {};
  const nextTaskSnapshot = {
    ...previousTaskSnapshot,
    ...taskSnapshot,
    userInput: taskSnapshot.userInput ?? previousTaskSnapshot.userInput ?? null,
    outline: taskSnapshot.outline ?? previousTaskSnapshot.outline ?? null,
    templateFileId: taskSnapshot.templateFileId ?? previousTaskSnapshot.templateFileId ?? null,
    templateFileName: taskSnapshot.templateFileName ?? previousTaskSnapshot.templateFileName ?? null,
    templateFileType: taskSnapshot.templateFileType ?? previousTaskSnapshot.templateFileType ?? null,
    resultFileId: taskSnapshot.resultFileId ?? previousTaskSnapshot.resultFileId ?? null,
    resultFileName: taskSnapshot.resultFileName ?? previousTaskSnapshot.resultFileName ?? null,
    resultFileType: taskSnapshot.resultFileType ?? previousTaskSnapshot.resultFileType ?? null
  };

  if (matchingIndex >= 0) {
    cleanedTaskSnapshots.splice(matchingIndex, 1);
  }

  const nextTaskSnapshots = [nextTaskSnapshot, ...cleanedTaskSnapshots];
  setTaskSnapshotsForSession(sessionId, nextTaskSnapshots, code, nextTaskSnapshot.taskId || null);
}

function hydrateTaskSnapshotFromError(error) {
  if (!error?.data || typeof error.data !== 'object') {
    return null;
  }

  return {
    ...error.data,
    errorMessage: error.data.errorMessage || error.message || null
  };
}

function getTaskFormForSession(sessionId) {
  if (!sessionId) {
    return {
      userInput: '',
      outline: '',
      generationMode: 'paper_format_to_paper',
      venueLabel: 'IEEE',
      venueVariant: 'conference',
      authors: '',
      controlMode: 'batch_autopilot'
    };
  }

  return taskFormsBySessionId.value[sessionId] || {
    userInput: '',
    outline: '',
    generationMode: 'paper_format_to_paper',
    venueLabel: 'IEEE',
    venueVariant: 'conference',
    authors: '',
    controlMode: 'batch_autopilot'
  };
}

function syncTaskFormForSession(sessionId) {
  const taskForm = getTaskFormForSession(sessionId);
  taskUserInput.value = taskForm.userInput || '';
  taskOutline.value = taskForm.outline || '';
  taskGenerationMode.value = taskForm.generationMode || 'paper_format_to_paper';
  taskVenueLabel.value = taskForm.venueLabel || 'IEEE';
  taskVenueVariant.value = taskForm.venueVariant || 'conference';
  taskAuthors.value = taskForm.authors || '';
  taskControlMode.value = taskForm.controlMode || 'batch_autopilot';
  selectedTemplateFile.value = null;
  selectedApiTemplate.value = null;
  codeFiles.value = [];
  codeAnalysis.value = null;
  taskCitationStyle.value = 'gb';
  taskTargetWordCount.value = null;
}

function persistTaskFormForSession(sessionId = selectedSessionId.value) {
  if (!sessionId) {
    return;
  }

  taskFormsBySessionId.value = {
    ...taskFormsBySessionId.value,
    [sessionId]: {
      userInput: taskUserInput.value,
      outline: taskOutline.value,
      generationMode: taskGenerationMode.value,
      venueLabel: taskVenueLabel.value,
      venueVariant: taskVenueVariant.value,
      authors: taskAuthors.value,
      controlMode: taskControlMode.value
    }
  };
}

function removeSessionWorkspaceState(sessionId) {
  if (!sessionId) {
    return;
  }

  const nextSelectedFileIdsBySessionId = { ...selectedFileIdsBySessionId.value };
  delete nextSelectedFileIdsBySessionId[sessionId];
  selectedFileIdsBySessionId.value = nextSelectedFileIdsBySessionId;

  const nextTaskSnapshotsBySessionId = { ...taskSnapshotsBySessionId.value };
  delete nextTaskSnapshotsBySessionId[sessionId];
  taskSnapshotsBySessionId.value = nextTaskSnapshotsBySessionId;

  const nextCurrentTaskIdBySessionId = { ...currentTaskIdBySessionId.value };
  delete nextCurrentTaskIdBySessionId[sessionId];
  currentTaskIdBySessionId.value = nextCurrentTaskIdBySessionId;

  const nextTaskCodesBySessionId = { ...taskCodesBySessionId.value };
  delete nextTaskCodesBySessionId[sessionId];
  taskCodesBySessionId.value = nextTaskCodesBySessionId;

  const nextSessionTaskListBySessionId = { ...sessionTaskListBySessionId.value };
  delete nextSessionTaskListBySessionId[sessionId];
  sessionTaskListBySessionId.value = nextSessionTaskListBySessionId;

  const nextSessionDetailsBySessionId = { ...sessionDetailsBySessionId.value };
  delete nextSessionDetailsBySessionId[sessionId];
  sessionDetailsBySessionId.value = nextSessionDetailsBySessionId;

  const nextTaskFormsBySessionId = { ...taskFormsBySessionId.value };
  delete nextTaskFormsBySessionId[sessionId];
  taskFormsBySessionId.value = nextTaskFormsBySessionId;
}

function finalizeSessionDeletion(sessionId) {
  sessions.value = sessions.value.filter((item) => item.sessionId !== sessionId);
  removeSessionWorkspaceState(sessionId);
  if (selectedSessionId.value === sessionId) {
    selectedSessionId.value = '';
  }
  if (
    pollingSessionId.value === sessionId
    || streamingSessionId.value === sessionId
    || pendingTaskSessionId.value === sessionId
  ) {
    pendingTaskSessionId.value = '';
    clearTaskTransportForSession(sessionId);
    clearTaskStreamFallback(sessionId);
  }
  syncSessionSelection();
}

function canForceDeleteSession(error) {
  const message = String(error?.message || '');
  return Number(error?.code) === 400 && /任务|无法删除|会话下已有/.test(message);
}

function hasActiveTaskInSession(sessionId) {
  const taskSnapshots = taskSnapshotsBySessionId.value[sessionId] || [];
  return taskSnapshots.some((item) => isActiveTaskStatus(item?.status));
}

function handleTaskProgressUpdate(sessionId, taskSnapshot) {
  const resolvedSessionId = taskSnapshot?.sessionId || sessionId;
  if (!resolvedSessionId || !taskSnapshot?.taskId) {
    return;
  }

  const isTerminal = isTerminalTaskStatus(taskSnapshot.status);

  if (isTerminal) {
    // Terminal events (completed/failed) flush immediately for responsive UX
    flushSSEUpdates();
    setTaskSnapshot(resolvedSessionId, taskSnapshot, inferTaskCodeFromSnapshot(taskSnapshot));
    const mergedTaskSnapshot = (taskSnapshotsBySessionId.value[resolvedSessionId] || [])
      .find((item) => item?.taskId === taskSnapshot.taskId) || taskSnapshot;
    upsertSessionTaskSummary(resolvedSessionId, mergedTaskSnapshot);
  } else {
    // In-progress events are debounced to avoid overwhelming Vue reactivity
    pendingSSEUpdates.set(taskSnapshot.taskId, { sessionId: resolvedSessionId, taskSnapshot });
    scheduleSSEFlush();
  }
}

function startTaskPolling(sessionId) {
  if (!sessionId) {
    clearTaskPolling();
    return;
  }
  if (streamingSessionId.value === sessionId) {
    clearTaskStream();
  }
  if (pollingSessionId.value === sessionId && taskTimer.value) {
    return;
  }

  clearTaskPolling();
  pollingSessionId.value = sessionId;
  const pollStart = Date.now();
  const MAX_POLL_MS = 30 * 60 * 1000; // 30 分钟后停止 polling 避免无限循环
  taskTimer.value = window.setInterval(() => {
    if (Date.now() - pollStart > MAX_POLL_MS) {
      clearTaskPolling();
      try {
        setFlash('warning', '长时间未收到任务更新，已停止自动刷新。请手动刷新页面。');
      } catch (_) { /* noop */ }
      return;
    }
    loadSessionWorkspace(sessionId, true, AUDIT_TRIGGER_SOURCE.AUTO_REFRESH);
  }, 5000);
}

function startTaskProgressTransport(sessionId, taskId) {
  if (!sessionId || !taskId) {
    clearTaskStream();
    return false;
  }
  if (
    streamingSessionId.value === sessionId
    && streamingTaskId.value === taskId
    && taskStream.value
  ) {
    return true;
  }

  clearTaskTransport();
  const streamObj = createTaskProgressStream(taskId, {
    onReconnect: (attempt, delay) => {
      reconnecting.active = true;
      reconnecting.attempt = attempt;
      reconnecting.message = `连接中断，正在重连 (${attempt}/5)...`;
    },
    onGiveUp: () => {
      reconnecting.active = false;
      setTaskStreamFallback(sessionId, taskId);
      startTaskPolling(sessionId);
    },
  });
  if (!streamObj) {
    return false;
  }

  const stream = streamObj.eventSource;
  taskStream.value = streamObj;
  streamingSessionId.value = sessionId;
  streamingTaskId.value = taskId;

  stream.onopen = () => {
    reconnecting.active = false;
    clearTaskStreamFallback(sessionId, taskId);
  };

  stream.onmessage = async (event) => {
    const payload = parseTaskProgressEvent(event?.data);
    if (!payload?.taskId) {
      return;
    }

    // Handle real-time content events for streaming preview
    if (payload.type === 'content') {
      handleContentEvent(payload);
      return;
    }

    const targetSessionId = payload.sessionId || sessionId;
    handleTaskProgressUpdate(targetSessionId, payload);

    if (isTerminalTaskStatus(payload.status)) {
      // Generation finished — stop streaming preview state
      clearStreamingSections();
    }

    if (!isTerminalTaskStatus(payload.status)) {
      return;
    }

    clearTaskTransportForSession(targetSessionId);
    try {
      await refreshTaskStatus(payload.taskId, targetSessionId, true, AUDIT_TRIGGER_SOURCE.AUTO_REFRESH);
    } catch (error) {
      setFlash('error', error.message);
    }
  };

  stream.onerror = (evt) => {
    // 流内部会自动重试；若重试耗尽 onGiveUp 会触发 polling fallback
    // 这里显式给用户一个轻提示，避免"看起来卡住"的错觉
    try {
      const msg = evt?.message || '生成进度连接不稳定，正在自动重试...';
      if (typeof setFlash === 'function') {
        setFlash('warning', msg);
      }
    } catch (_) {
      // noop
    }
  };

  return true;
}

function syncTaskTransportForSelectedSession() {
  const sessionId = pendingTaskSessionId.value || selectedSessionId.value;
  const taskSnapshot = getTaskSnapshotForSession(sessionId);

  if (!sessionId || !taskSnapshot?.taskId || !isActiveTaskStatus(taskSnapshot.status)) {
    if (sessionId) {
      clearTaskStreamFallback(sessionId);
    }
    clearTaskTransport();
    return;
  }

  if (streamFallbackTaskIdBySessionId.value[sessionId] === taskSnapshot.taskId) {
    startTaskPolling(sessionId);
    return;
  }

  if (startTaskProgressTransport(sessionId, taskSnapshot.taskId)) {
    return;
  }

  setTaskStreamFallback(sessionId, taskSnapshot.taskId);
  startTaskPolling(sessionId);
}

function syncSessionSelection() {
  if (!sessions.value.length) {
    selectedSessionId.value = '';
    return;
  }
  if (!selectedSessionId.value || !sessions.value.some((item) => item.sessionId === selectedSessionId.value)) {
    selectedSessionId.value = sessions.value[0].sessionId;
  }
}

async function bootstrapPage() {
  loading.bootstrap = true;
  clearFlash();
  workspaceStateReady.value = false;
  try {
    const [userRes, sessionRes] = await Promise.all([
      getUserInfo(),
      getSessions()
    ]);
    userStore.updateUserInfo(userRes.data);
    restoreWorkspaceState();
    sessions.value = sessionRes.data || [];
    pruneWorkspaceState();
    syncSessionSelection();
    workspaceStateReady.value = true;
    syncTaskFormForSession(selectedSessionId.value);
    persistWorkspaceState();
    if (selectedSessionId.value) {
      await Promise.all([
        loadSessionWorkspace(selectedSessionId.value, true, AUDIT_TRIGGER_SOURCE.USER_ACTION),
        loadSessionAttachments(selectedSessionId.value, true, AUDIT_TRIGGER_SOURCE.USER_ACTION)
      ]);
    }
    syncTaskTransportForSelectedSession();
    // P2-4: Check for active tasks to recover SSE connection after page reload
    recoverActiveTask();
  } catch (error) {
    setFlash('error', error.message);
  } finally {
    loading.bootstrap = false;
  }
}

async function recoverActiveTask() {
  const sessionId = selectedSessionId.value;
  if (!sessionId) return;
  try {
    const res = await getActiveTask(sessionId);
    const activeTask = res?.data?.data;
    if (activeTask?.taskId && !isTerminalTaskStatus(activeTask.status)) {
      reconnecting.active = true;
      reconnecting.message = '检测到进行中的任务，正在恢复连接...';
      // Re-establish SSE stream for the active task
      const connected = startTaskProgressTransport(sessionId, activeTask.taskId);
      if (connected) {
        handleTaskProgressUpdate(sessionId, activeTask);
      }
      setTimeout(() => { reconnecting.active = false; }, 3000);
    }
  } catch (e) {
    // Non-critical — silently ignore recovery failures
  }
}

async function loadSessionWorkspace(sessionId, silent = true, triggerSource = AUDIT_TRIGGER_SOURCE.USER_ACTION) {
  if (!sessionId) {
    return;
  }

  if (triggerSource === AUDIT_TRIGGER_SOURCE.USER_ACTION) {
    loading.workspace = true;
  }
  try {
    const response = await getSessionWorkspace(sessionId, withAuditTrigger(triggerSource));
    applySessionWorkspace(sessionId, response.data);
  } catch (error) {
    if (!silent) {
      setFlash('error', error.message);
    }
  } finally {
    if (triggerSource === AUDIT_TRIGGER_SOURCE.USER_ACTION) {
      loading.workspace = false;
    }
  }
}

async function loadSessionAttachments(sessionId, silent = true, triggerSource = AUDIT_TRIGGER_SOURCE.USER_ACTION) {
  if (!sessionId) {
    return null;
  }

  loading.attachments = true;
  try {
    const response = await getSessionAttachments(sessionId, withAuditTrigger(triggerSource));
    const attachments = normalizeSessionAttachmentList(response.data);
    files.value = attachments;
    syncSelectedFileIdsWithAttachments(sessionId, attachments);
    return attachments;
  } catch (error) {
    if (!silent) {
      setFlash('error', error.message);
    }
    return null;
  } finally {
    loading.attachments = false;
  }
}

async function handleCreateSession() {
  loading.session = true;
  clearFlash();
  try {
    const response = await createSession({ title: '新对话' }, withAuditTrigger());
    sessions.value = [response.data, ...sessions.value];
    setSessionDetail(response.data.sessionId, response.data);
    selectedSessionId.value = response.data.sessionId;
    setFlash('success', '会话创建成功。');
  } catch (error) {
    setFlash('error', error.message);
  } finally {
    loading.session = false;
  }
}

async function handleDeleteSession(sessionId) {
  if (!window.confirm('删除会话后将无法继续在列表中查看，确认删除吗？')) {
    return;
  }
  clearFlash();
  try {
    await deleteSession(sessionId, withAuditTrigger());
    finalizeSessionDeletion(sessionId);
    setFlash('success', '会话已删除。');
  } catch (error) {
    if (
      userStore.isAdmin &&
      canForceDeleteSession(error) &&
      window.confirm('普通删除失败，当前会话下可能已经有关联任务。是否以管理员身份强制清理该会话及其任务记录？此操作不可恢复。')
    ) {
      try {
        await forceDeleteSessionAsAdmin(sessionId, withAuditTrigger());
        finalizeSessionDeletion(sessionId);
        setFlash('success', '管理员已强制清理该测试会话。');
      } catch (forceDeleteError) {
        setFlash('error', forceDeleteError.message);
      }
      return;
    }
    setFlash('error', error.message);
  }
}

async function handleRenameSession(sessionId, newTitle) {
  try {
    await updateSession(sessionId, { title: newTitle });
    const sess = sessions.value.find(s => s.sessionId === sessionId);
    if (sess) sess.title = newTitle;
  } catch (error) {
    setFlash('error', error.message);
  }
}

async function handleUploadFiles(event) {
  if (!selectedSessionId.value) {
    setFlash('error', '请先选择或创建会话。');
    return;
  }

  const incomingFiles = Array.from(event.target.files || []);
  if (!incomingFiles.length) {
    return;
  }
  loading.upload = true;
  clearFlash();
  const uploadedFiles = [];
  try {
    for (const current of incomingFiles) {
      const response = await uploadSessionAttachment(selectedSessionId.value, current, withAuditTrigger());
      const uploadedFile = normalizeSessionAttachmentFile(response.data);
      if (uploadedFile) {
        uploadedFiles.push(uploadedFile);
      }
    }

    if (uploadedFiles.length) {
      files.value = normalizeSessionAttachmentList([
        ...uploadedFiles,
        ...files.value
      ]);
      setSelectedFileIdsForSession(selectedSessionId.value, [
        ...selectedFileIds.value,
        ...uploadedFiles.map((item) => item.fileId)
      ]);
      setFlash('success', `已上传并加入当前草稿 ${uploadedFiles.length} 篇附件。`);
    }
  } catch (error) {
    setFlash('error', error.message);
  } finally {
    loading.upload = false;
    event.target.value = '';
  }
}

async function handleDeleteFile(fileId) {
  if (!window.confirm('确认删除这个文件吗？如果已被引用，后端会拒绝删除。')) {
    return;
  }
  clearFlash();
  try {
    await deleteFile(fileId);
    files.value = files.value.filter((item) => item.fileId !== fileId);
    removeDeletedFileSelections(fileId);
    if (selectedSessionId.value) {
      await loadSessionAttachments(selectedSessionId.value, true, AUDIT_TRIGGER_SOURCE.USER_ACTION);
    }
    setFlash('success', '文件删除成功。');
  } catch (error) {
    setFlash('error', error.message);
  }
}

async function refreshTaskStatus(
  taskId,
  sessionId = selectedSessionId.value,
  silent = false,
  triggerSource = AUDIT_TRIGGER_SOURCE.USER_ACTION
) {
  try {
    const response = await getTaskStatus(taskId, withAuditTrigger(triggerSource));
    setTaskSnapshot(sessionId, response.data, response.code);
    upsertSessionTaskSummary(sessionId, response.data);
    if (!hasActiveTaskInSession(sessionId)) {
      clearTaskTransportForSession(sessionId);
      clearTaskStreamFallback(sessionId);
    }
    if (!silent) {
      setFlash('success', response.message);
    }
  } catch (error) {
    const failedTaskSnapshot = hydrateTaskSnapshotFromError(error);
    if (failedTaskSnapshot) {
      setTaskSnapshot(sessionId, failedTaskSnapshot, error.code ?? 500);
      upsertSessionTaskSummary(sessionId, failedTaskSnapshot);
    }
    if (!hasActiveTaskInSession(sessionId)) {
      clearTaskTransportForSession(sessionId);
      clearTaskStreamFallback(sessionId);
    }
    if (!silent || failedTaskSnapshot) {
      setFlash('error', error.message);
    }
  }
}

async function handleClarifyCheck() {
  const userInput = taskUserInput.value.trim();
  if (!userInput) return;
  _lastClarifyInput = userInput;
  clarifyState.loading = true;
  try {
    const resp = await checkClarification({
      userInput,
      hasOutline: !!taskOutline.value.trim(),
      hasTemplate: !!selectedTemplateFile.value,
      hasFiles: selectedFileIds.value.length > 0,
    });
    const data = resp.data;
    if (data.needsClarification && data.questions?.length) {
      if (selectedSessionId.value) {
        // Start inline clarification flow (replaces popup)
        startInlineClarification(userInput);
        clarifyState.loading = false;
        return;
      }
      // Fallback to batch mode
      clarifyState.questions = data.questions;
      clarifyState.answers = {};
      data.questions.forEach(q => { clarifyState.answers[q.id] = ''; });
      clarifyState.active = true;
    } else {
      // No clarification needed → show outline preview
      handleOutlinePreview();
    }
  } catch (e) {
    if (_isLLMError(e)) {
      setFlash('error', _llmFlashMessage(e));
    } else {
      // Fail-open: proceed with task creation on non-LLM failure
      console.warn('Clarification check failed, proceeding:', e);
      setFlash('warning', '需求澄清服务暂不可用，将直接生成报告');
      handleCreateTask();
    }
  } finally {
    clarifyState.loading = false;
  }
}

async function tryExtractDocumentInfo() {
  // Best-effort: extract document info from uploaded files for better clarification questions
  try {
    const files = selectedFiles.value;
    if (!files.length) return;
    const firstFile = files[0];
    const res = await extractDocumentInfo(selectedSessionId.value, {
      textExcerpt: firstFile.fileName || '',
      fileName: firstFile.fileName || '',
    });
    if (res?.data) {
      // Feed into inline clarification if active
      if (inlineClarify.active) {
        inlineClarify.documentInfo = res.data;
      } else if (clarificationChatRef.value) {
        clarificationChatRef.value.setDocumentInfo(res.data);
      }
    }
  } catch (e) {
    // Non-critical, ignore
  }
}

// ─── Inline Clarification Flow ───────────────────────────
function startInlineClarification(userInput) {
  // Reset state
  inlineClarify.messages = [];
  inlineClarify.history = [];
  inlineClarify.documentInfo = null;
  inlineClarify.currentQuestion = null;
  inlineClarify.step = 0;
  inlineClarify.topic = userInput;
  inlineClarify.savedUserInput = userInput;
  inlineClarify.processing = false;
  inlineClarify.active = true;

  // Add user's original text as first message
  inlineClarify.messages.push({
    id: _nextMsgId(), type: 'user_text', content: userInput,
  });

  // Extract document info if files uploaded
  if (selectedFileIds.value.length > 0) {
    tryExtractDocumentInfo();
  }

  // Fetch first question
  fetchNextInlineQuestion();
}

async function fetchNextInlineQuestion() {
  if (!selectedSessionId.value || !inlineClarify.topic) return;
  inlineClarify.processing = true;
  try {
    const res = await clarifyNext(selectedSessionId.value, {
      topic: inlineClarify.topic,
      history: inlineClarify.history,
      documentInfo: inlineClarify.documentInfo,
    });
    const data = res?.data ?? res;
    if (data) {
      inlineClarify.step = data.step || 0;
      if (data.isComplete) {
        // All questions done, finish automatically
        await finishInlineClarification();
        return;
      }
      if (data.question) {
        inlineClarify.currentQuestion = data.question;
        const qId = `q-${inlineClarify.step}`;
        inlineClarify.messages.push({
          id: _nextMsgId(),
          type: 'system_question',
          content: data.question.question,
          options: data.question.options || [],
          allowCustom: true,
          multiSelect: data.question.allowMultiple || false,
          questionId: qId,
          explanation: data.question.explanation || '',
          answered: false,
          selectedAnswer: null,
        });
      }
    }
  } catch (e) {
    if (_isLLMError(e)) {
      console.warn('Inline clarify fetchNext LLM error:', e);
      inlineClarify.messages.push({
        id: _nextMsgId(), type: 'progress_update',
        content: _llmFlashMessage(e),
      });
      resetInlineClarification();
      setFlash('error', _llmFlashMessage(e));
    } else {
      console.warn('Inline clarify fetchNext failed:', e);
      inlineClarify.messages.push({
        id: _nextMsgId(), type: 'progress_update',
        content: '获取问题失败，正在跳过澄清...',
      });
      // Fail-open: proceed without clarification
      resetInlineClarification();
      handleOutlinePreview();
    }
  } finally {
    inlineClarify.processing = false;
  }
}

function handleInlineClarifyAnswer({ questionId, answer }) {
  // Mark the question message as answered
  const qMsg = inlineClarify.messages.find(
    m => m.type === 'system_question' && m.questionId === questionId
  );
  if (qMsg) {
    qMsg.answered = true;
    qMsg.selectedAnswer = answer;
  }

  // Add answer message
  inlineClarify.messages.push({
    id: _nextMsgId(), type: 'user_answer',
    content: answer, questionId,
  });

  // Submit to backend
  submitInlineAnswer(answer);
}

async function submitInlineAnswer(answer) {
  inlineClarify.processing = true;
  try {
    const res = await clarifyAnswer(selectedSessionId.value, {
      topic: inlineClarify.topic,
      answer,
      history: inlineClarify.history,
      documentInfo: inlineClarify.documentInfo,
    });
    const data = res?.data ?? res;
    if (data) {
      // Update history
      inlineClarify.history.push({
        question: inlineClarify.currentQuestion?.question || '',
        answer,
      });
      inlineClarify.step = data.step || 0;

      if (data.isComplete) {
        inlineClarify.messages.push({
          id: _nextMsgId(), type: 'progress_update',
          content: '所有问题已回答完毕，正在生成需求总结...',
        });
        await finishInlineClarification();
      } else if (data.question) {
        inlineClarify.currentQuestion = data.question;
        const qId = `q-${inlineClarify.step}`;
        inlineClarify.messages.push({
          id: _nextMsgId(),
          type: 'system_question',
          content: data.question.question,
          options: data.question.options || [],
          allowCustom: true,
          multiSelect: data.question.allowMultiple || false,
          questionId: qId,
          explanation: data.question.explanation || '',
          answered: false,
          selectedAnswer: null,
        });
      }
    }
  } catch (e) {
    console.warn('Inline clarify answer failed:', e);
    inlineClarify.messages.push({
      id: _nextMsgId(), type: 'progress_update',
      content: '提交回答失败，正在继续...',
    });
  } finally {
    inlineClarify.processing = false;
  }
}

async function handleInlineClarifySkip() {
  // Skip the current question or skip all remaining clarification
  if (!inlineClarify.active) return;

  if (inlineClarify.currentQuestion) {
    // Skip just this question
    inlineClarify.processing = true;
    inlineClarify.messages.push({
      id: _nextMsgId(), type: 'user_answer',
      content: '(跳过此问题)',
      questionId: `q-${inlineClarify.step}`,
    });
    // Mark the current question as answered
    const lastQ = [...inlineClarify.messages].reverse().find(
      m => m.type === 'system_question' && !m.answered
    );
    if (lastQ) { lastQ.answered = true; lastQ.selectedAnswer = '(跳过)'; }

    try {
      const res = await clarifySkipApi(selectedSessionId.value, {
        topic: inlineClarify.topic,
        history: inlineClarify.history,
        documentInfo: inlineClarify.documentInfo,
      });
      const data = res?.data ?? res;
      if (data) {
        inlineClarify.history.push({
          question: inlineClarify.currentQuestion?.question || '',
          answer: '(跳过)',
        });
        inlineClarify.step = data.step || 0;

        if (data.isComplete) {
          await finishInlineClarification();
        } else if (data.question) {
          inlineClarify.currentQuestion = data.question;
          const qId = `q-${inlineClarify.step}`;
          inlineClarify.messages.push({
            id: _nextMsgId(),
            type: 'system_question',
            content: data.question.question,
            options: data.question.options || [],
            allowCustom: true,
            multiSelect: data.question.allowMultiple || false,
            questionId: qId,
            explanation: data.question.explanation || '',
            answered: false,
            selectedAnswer: null,
          });
        }
      }
    } catch (e) {
      console.warn('Inline clarify skip failed:', e);
    } finally {
      inlineClarify.processing = false;
    }
  } else {
    // Skip entire clarification
    resetInlineClarification();
    handleOutlinePreview();
  }
}

async function finishInlineClarification() {
  inlineClarify.processing = true;
  try {
    const res = await clarifyFinish(selectedSessionId.value, {
      topic: inlineClarify.topic,
      history: inlineClarify.history,
      documentInfo: inlineClarify.documentInfo,
    });
    const data = res?.data ?? res;
    if (data) {
      const requirement = data.requirement || '';
      const summary = data.summary || {};
      clarifyState.refinedRequirement = requirement;

      // Show task card
      inlineClarify.messages.push({
        id: _nextMsgId(),
        type: 'task_card',
        content: '需求摘要',
        summary,
        requirement,
        history: [...inlineClarify.history],
      });
      inlineClarify.processing = false;
      // Don't auto-proceed — wait for user confirm
    }
  } catch (e) {
    console.warn('Inline clarify finish failed:', e);
    inlineClarify.messages.push({
      id: _nextMsgId(), type: 'progress_update',
      content: '生成总结失败，将使用原始输入继续...',
    });
    inlineClarify.processing = false;
    // Fail-open: proceed
    resetInlineClarification();
    handleOutlinePreview();
  }
}

function handleInlineClarifyConfirm() {
  // User confirmed the task card → proceed to outline preview
  resetInlineClarification();
  handleOutlinePreview();
}

function handleInlineClarifyModify() {
  // User wants to modify → restart clarification with the same input
  const savedInput = inlineClarify.savedUserInput;
  resetInlineClarification();
  taskUserInput.value = savedInput;
  setFlash('info', '请修改您的需求描述后重新提交');
}

function resetInlineClarification() {
  inlineClarify.active = false;
  inlineClarify.processing = false;
  inlineClarify.messages = [];
  inlineClarify.history = [];
  inlineClarify.documentInfo = null;
  inlineClarify.currentQuestion = null;
  inlineClarify.step = 0;
  inlineClarify.topic = '';
  inlineClarify.savedUserInput = '';
}

function handleProgressiveClarifyFinish({ requirement, summary, history }) {
  progressiveClarify.active = false;
  if (requirement) {
    clarifyState.refinedRequirement = requirement;
  }
  handleOutlinePreview();
}

function handleProgressiveClarifyClose() {
  progressiveClarify.active = false;
  // User closed without finishing — proceed with outline preview
  handleOutlinePreview();
}

async function handleClarifySubmit() {
  // Only require answers for high-priority/required questions
  const requiredQuestions = clarifyState.questions.filter(q => q.required || q.priority === 'high');
  const hasEmptyRequired = requiredQuestions.some(q => !String(clarifyState.answers[q.id] || '').trim());
  if (hasEmptyRequired) {
    setFlash('error', '请至少回答标有 * 的必填问题');
    return;
  }
  clarifyState.loading = true;
  try {
    const resp = await refineClarification({
      userInput: taskUserInput.value.trim(),
      answers: clarifyState.answers,
    });
    clarifyState.refinedRequirement = resp.data.requirements;
    if (resp.data.safetyWarning) {
      clarifyState.safetyWarning = resp.data.safetyWarning;
    }
    clarifyState.active = false;
    handleOutlinePreview();
  } catch (e) {
    if (e?.response?.status === 403) {
      setFlash('error', e?.response?.data?.message || '输入内容未通过安全检查，请调整后重试');
      return;
    }
    console.warn('Clarification refine failed, proceeding:', e);
    setFlash('warning', '需求细化失败，将使用原始输入生成');
    clarifyState.active = false;
    handleCreateTask();
  } finally {
    clarifyState.loading = false;
  }
}

function handleClarifySkip() {
  clarifyState.active = false;
  clarifyState.refinedRequirement = null;
  handleOutlinePreview();
}

async function handleOutlinePreview() {
  // If user already provided a custom outline, skip preview
  if (taskOutline.value.trim()) {
    handleCreateTask();
    return;
  }
  outlinePreview.loading = true;
  outlinePreview.active = true;
  try {
    const resp = await previewOutline({
      userInput: taskUserInput.value.trim(),
      requirement: clarifyState.refinedRequirement || null,
    });
    const sections = resp.data.sections || [];
    outlinePreview.sections = sections;
    outlinePreview.editedSections = sections.map(s => ({ ...s }));
  } catch (e) {
    if (_isLLMError(e)) {
      console.warn('Outline preview LLM error:', e);
      setFlash('error', _llmFlashMessage(e));
      outlinePreview.active = false;
    } else {
      console.warn('Outline preview failed, proceeding:', e);
      setFlash('warning', '大纲预览生成失败，将直接生成报告');
      outlinePreview.active = false;
      handleCreateTask();
    }
  } finally {
    outlinePreview.loading = false;
  }
}

function handleOutlineConfirm() {
  const hasEmptyTitle = outlinePreview.editedSections.some(s => !s.title.trim());
  if (hasEmptyTitle) {
    setFlash('error', '请为所有章节填写标题');
    return;
  }
  const outlineText = outlinePreview.editedSections
    .map(s => `## ${s.title}\n${s.description}`)
    .join('\n\n');
  taskOutline.value = outlineText;
  outlinePreview.active = false;
  outlinePreview.sections = [];
  outlinePreview.editedSections = [];
  handleCreateTask();
}

function handleOutlineSkip() {
  outlinePreview.active = false;
  outlinePreview.sections = [];
  outlinePreview.editedSections = [];
  handleCreateTask();
}

function handleOutlineMoveUp(index) {
  if (index <= 0) return;
  const arr = outlinePreview.editedSections;
  [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
}

function handleOutlineMoveDown(index) {
  const arr = outlinePreview.editedSections;
  if (index >= arr.length - 1) return;
  [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
}

function handleOutlineDeleteSection(index) {
  outlinePreview.editedSections.splice(index, 1);
}

function handleOutlineAddSection() {
  outlinePreview.editedSections.push({ title: '', description: '', targetWords: 0 });
}

async function handleCreateTask() {
  if (taskFormError.value) {
    setFlash('error', taskFormError.value);
    return;
  }
  const sessionId = selectedSessionId.value;
  const userInput = taskUserInput.value.trim();
  const outline = taskOutline.value.trim();
  const userFileIds = [...selectedFileIds.value];
  const attachmentSnapshot = buildAttachmentSnapshotFromFiles(selectedFiles.value);
  const localTemplateFile = selectedTemplateFile.value;
  let templateSnapshot = buildTaskTemplateSnapshot(null);
  let templateFileIdToUse = null;
  let shouldCleanupUploadedTemplate = false;
  let hasQueuedTaskDraft = false;
  
  // 如果选择了模板文件，先上传
  loading.task = true;
  pendingTaskSessionId.value = sessionId;
  clearFlash();
  clearTaskTransport();
  try {
    if (localTemplateFile) {
      const uploadResponse = await uploadFile(localTemplateFile, withAuditTrigger());
      templateSnapshot = buildTaskTemplateSnapshot(uploadResponse.data);
      templateFileIdToUse = templateSnapshot.templateFileId;
      shouldCleanupUploadedTemplate = Boolean(templateFileIdToUse);
    }

    setTaskSnapshot(sessionId, {
      taskId: null,
      sessionId,
      status: 'pending',
      progress: 0,
      currentSection: null,
      totalSections: null,
      resultMarkdown: null,
      resultFileId: null,
      resultFileName: null,
      resultFileType: null,
      errorMessage: null,
      userInput,
      outline: outline || null,
      ...templateSnapshot,
      ...attachmentSnapshot
    }, 202);
    hasQueuedTaskDraft = true;
    taskUserInput.value = '';
    taskOutline.value = '';
    selectedTemplateFile.value = null;
    selectedApiTemplate.value = null;
    codeFiles.value = [];
    codeAnalysis.value = null;
    persistTaskFormForSession(sessionId);

    const response = await submitGenerateTask(sessionId, {
      userInput,
      outline: outline || null,
      templateFileId: templateFileIdToUse,
      userFileIds,
      requirement: clarifyState.refinedRequirement || null,
      citationStyle: taskCitationStyle.value,
      targetWordCount: taskTargetWordCount.value || undefined,
      generationMode: taskGenerationMode.value,
      venueLabel: taskVenueLabel.value || undefined,
      venueVariant: taskVenueVariant.value || undefined,
      authors: taskAuthors.value
        .split(/[,，;]/)
        .map((item) => item.trim())
        .filter(Boolean),
      controlMode: taskControlMode.value,
    }, withAuditTrigger());
    // Reset clarification state after successful submission
    Object.assign(clarifyState, { active: false, loading: false, questions: [], answers: {}, refinedRequirement: null });
    shouldCleanupUploadedTemplate = false;
    setTaskSnapshot(sessionId, {
      taskId: response.data.taskId,
      sessionId: response.data.sessionId,
      status: response.data.status,
      progress: 0,
      currentSection: null,
      totalSections: null,
      resultMarkdown: null,
      resultFileId: null,
      resultFileName: null,
      resultFileType: null,
      errorMessage: null,
      userInput,
      outline: outline || null,
      ...templateSnapshot,
      ...attachmentSnapshot
    }, 202, { replacePlaceholder: true });
    setSelectedFileIdsForSession(sessionId, []);
    setFlash('success', '任务已提交，正在同步进度。');

    // 在对话中插入任务状态卡片
    inlineClarify.messages.push({
      id: _nextMsgId(),
      type: 'task_status',
      task: { ...response.data },
    });
    clearTaskStreamFallback(sessionId);
    syncTaskTransportForSelectedSession();
    try {
      await refreshTaskStatus(response.data.taskId, sessionId, true, AUDIT_TRIGGER_SOURCE.USER_ACTION);
      await loadSessionWorkspace(sessionId, true, AUDIT_TRIGGER_SOURCE.USER_ACTION);
      // Refresh session list to reflect auto-renamed title
      const sessResp = await getSessions();
      sessions.value = sessResp.data || [];
    } catch (followUpError) {
      setFlash('error', followUpError.message);
    }
    if (String(getTaskSnapshotForSession(sessionId)?.status || '').toLowerCase() === 'failed') {
      setFlash('error', '任务执行失败，请查看主舞台中的原因说明和下一步建议。');
    }
  } catch (error) {
    if (isSafetyBlockError(error)) {
      safetyBlockData.value = {
        ...error.data,
        msg: buildSafetyBlockMessage(error)
      };
      showSafetyBlockModal.value = true;
      clearTaskSnapshotForSession(sessionId);
      taskUserInput.value = userInput;
      taskOutline.value = outline;
      selectedTemplateFile.value = localTemplateFile;
      
      if (shouldCleanupUploadedTemplate && templateFileIdToUse) {
        deleteFile(templateFileIdToUse).catch(e => {
          console.warn('Failed to clean up template after safety block', e);
        });
      }
      return;
    }

    const failedTaskSnapshot = hydrateTaskSnapshotFromError(error);
    if (shouldCleanupUploadedTemplate && templateFileIdToUse && !failedTaskSnapshot?.taskId) {
      try {
        await deleteFile(templateFileIdToUse);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary template file after task submission error.', cleanupError);
      }
    }
    if (hasQueuedTaskDraft || failedTaskSnapshot?.taskId) {
      setTaskSnapshot(sessionId, {
        ...templateSnapshot,
        ...attachmentSnapshot,
        ...(failedTaskSnapshot || {
          taskId: null,
          sessionId,
          status: 'failed',
          progress: 0,
          currentSection: null,
          totalSections: null,
          resultMarkdown: null,
          resultFileId: null,
          resultFileName: null,
          resultFileType: null,
          errorMessage: error.message || null,
          userInput,
          outline: outline || null
        })
      }, error.code ?? 500);
    }
    setFlash('error', error.message);
  } finally {
    pendingTaskSessionId.value = '';
    loading.task = false;
    syncTaskTransportForSelectedSession();
  }
}

async function handleDownloadTaskReport(format) {
  if (!currentTask.value?.taskId) {
    setFlash('error', '当前任务没有可下载的报告。');
    return;
  }
  if (!canDownloadCurrentTask.value) {
    setFlash('error', '任务尚未完成，暂时无法下载报告。');
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(downloadStates, format)) {
    setFlash('error', '暂不支持该下载格式。');
    return;
  }

  downloadStates[format] = true;
  clearFlash();
  try {
    const { blob, fileName } = await downloadTaskReport(currentTask.value.taskId, format, withAuditTrigger());
    triggerBrowserDownload(blob, fileName);
    setFlash('success', format === 'docx' ? 'DOCX 报告已开始下载。' : format === 'pdf' ? 'PDF 报告已开始下载。' : format === 'latex' ? 'LaTeX 报告已开始下载。' : 'Markdown 报告已开始下载。');
  } catch (error) {
    setFlash('error', error.message);
  } finally {
    downloadStates[format] = false;
  }
}

async function handleDownloadTaskReportByTask(payload) {
  const format = typeof payload === 'string' ? payload : payload?.format;
  const taskId = typeof payload === 'string' ? currentTask.value?.taskId : payload?.taskId;
  const taskSnapshot = taskHistory.value.find((item) => item.taskId === taskId) || currentTask.value;

  if (!taskId || !taskSnapshot?.taskId) {
    setFlash('error', '当前任务没有可下载的报告。');
    return;
  }
  if (!hasDownloadableTaskResult(taskSnapshot)) {
    setFlash('error', '任务尚未完成，暂时无法下载报告。');
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(createEmptyDownloadState(), format)) {
    setFlash('error', '暂不支持该下载格式。');
    return;
  }

  setDownloadStateForTask(taskId, format, true);
  clearFlash();
  try {
    const { blob, fileName } = await downloadTaskReport(taskId, format, withAuditTrigger());
    triggerBrowserDownload(blob, fileName);
    setFlash('success', format === 'docx' ? 'DOCX 报告已开始下载。' : format === 'pdf' ? 'PDF 报告已开始下载。' : format === 'latex' ? 'LaTeX 报告已开始下载。' : 'Markdown 报告已开始下载。');
  } catch (error) {
    setFlash('error', error.message);
  } finally {
    setDownloadStateForTask(taskId, format, false);
  }
}

async function toggleFileSelection(fileId) {
  if (!selectedSessionId.value) {
    setFlash('error', '请先选择或创建会话。');
    return;
  }

  const nextFileIds = selectedFileIds.value.includes(fileId)
    ? selectedFileIds.value.filter((item) => item !== fileId)
    : [...selectedFileIds.value, fileId];

  setSelectedFileIdsForSession(selectedSessionId.value, nextFileIds);
  setFlash(
    'success',
    nextFileIds.includes(fileId)
      ? '附件已加入当前草稿。'
      : '附件已从当前草稿移除。'
  );
}

async function handleRetryTask(taskId) {
  if (!taskId) return;
  setFlash('info', '正在重试任务...');
  try {
    await retryTask(taskId);
    setFlash('success', '重试已提交，正在重新生成报告...');
    await loadSessionWorkspace(selectedSessionId.value, false, AUDIT_TRIGGER_SOURCE.USER_ACTION);
  } catch (err) {
    const msg = err?.response?.data?.message || '重试失败，请稍后再试。';
    setFlash('error', msg);
  }
}

async function handleCancelTask(taskId) {
  if (!taskId) return;
  setFlash('info', '正在取消任务...');
  try {
    await cancelTask(taskId);
    setFlash('success', '任务已取消。');
    await loadSessionWorkspace(selectedSessionId.value, false, AUDIT_TRIGGER_SOURCE.USER_ACTION);
  } catch (err) {
    const msg = err?.response?.data?.message || '取消失败，请稍后再试。';
    setFlash('error', msg);
  }
}

async function logout() {
  clearTaskTransport();
  try {
    await apiLogout();
  } catch {
    // Always clear local state even if the API call fails
  }
  userStore.clearSession();
  router.push('/login');
}

function handleUploadTemplate(event) {
  const file = event.target.files?.[0] || null;
  if (file) {
    selectedTemplateFile.value = file;
    selectedApiTemplate.value = null;
  }
  event.target.value = '';
}

function handleSelectApiTemplate(template) {
  selectedApiTemplate.value = template;
  if (template) {
    selectedTemplateFile.value = null;
  }
}

function handleUploadCodeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return;
  codeFiles.value = [...codeFiles.value, ...files];
}

function handleRemoveCodeFile(index) {
  codeFiles.value = codeFiles.value.filter((_, i) => i !== index);
  if (codeFiles.value.length === 0) {
    codeAnalysis.value = null;
  }
}

function applyPromptSuggestion(userInput, outline = '') {
  taskUserInput.value = userInput;
  taskOutline.value = outline;
  selectedTemplateFile.value = null;
  selectedApiTemplate.value = null;
}

function handleShowArchiveUpload() {
  archiveUploadVisible.value = true;
}

function handleArchiveAnalyzed(data) {
  archiveAnalysis.value = data;
  archiveUploadVisible.value = false;
  // Auto-populate topic from first suggested topic if input is empty
  if (!taskUserInput.value.trim() && data?.suggested_topics?.length) {
    taskUserInput.value = data.suggested_topics[0];
  }
  setFlash('success', `项目分析完成：${data.project_type} 项目，共 ${data.total_files} 个文件`);
}

watch(
  [selectedSessionId, taskFormsBySessionId],
  () => {
    persistWorkspaceState();
  },
  { deep: true }
);

watch(
  selectedSessionId,
  async (sessionId, previousSessionId) => {
    if (!workspaceStateReady.value) {
      return;
    }
    if (previousSessionId) {
      persistTaskFormForSession(previousSessionId);
    }
    clearTaskTransport();
    if (!sessionId) {
      syncTaskFormForSession('');
      files.value = [];
      return;
    }
    syncTaskFormForSession(sessionId);
    await Promise.all([
      loadSessionWorkspace(sessionId, true, AUDIT_TRIGGER_SOURCE.USER_ACTION),
      loadSessionAttachments(sessionId, true, AUDIT_TRIGGER_SOURCE.USER_ACTION)
    ]);
  }
);

watch(
  [taskUserInput, taskOutline],
  () => {
    if (!workspaceStateReady.value || !selectedSessionId.value) {
      return;
    }
    persistTaskFormForSession();
  }
);

watch(
  [selectedSessionId, currentTaskCode, () => currentTask.value?.taskId],
  () => {
    if (!workspaceStateReady.value) {
      return;
    }
    syncTaskTransportForSelectedSession();
  }
);

onMounted(() => {
  bootstrapPage();
});

onBeforeUnmount(() => {
  clearTaskTransport();
  if (sseFlushTimer !== null) {
    window.clearTimeout(sseFlushTimer);
    sseFlushTimer = null;
  }
  pendingSSEUpdates.clear();
});

function handleUpdateTaskMarkdown({ taskId, markdown }) {
  if (!taskId || !markdown) return;
  for (const [sessionId, tasks] of Object.entries(taskSnapshotsBySessionId.value)) {
    const idx = tasks.findIndex(t => t.taskId === taskId);
    if (idx !== -1) {
      taskSnapshotsBySessionId.value[sessionId] = tasks.map(t =>
        t.taskId === taskId
          ? { ...t, resultMarkdown: markdown, resultFileId: null, resultFileName: null, resultFileType: null }
          : t
      );
      break;
    }
  }
}
</script>

<template>
  <WorkspaceChatConsole
    :current-user="currentUser"
    :flash="flash"
    :loading="loading"
    :sessions="sessions"
    :files="files"
    :selected-session-id="selectedSessionId"
    :current-session-detail="currentSessionDetail"
    :current-session-tasks="currentSessionTasks"
    :recent-task-history="recentTaskHistory"
    :task-history="taskHistory"
    :selected-files="selectedFiles"
    :selected-file-ids="selectedFileIds"
    :selected-template-file="selectedTemplateFile"
    :selected-api-template="selectedApiTemplate"
    :code-files="codeFiles"
    :code-analysis="codeAnalysis"
    :code-analyzing="codeAnalyzing"
    :current-task="currentTask"
    :current-task-code="currentTaskCode"
    :current-task-progress="currentTaskProgress"
    :current-task-tone="currentTaskTone"
    :current-task-failure="currentTaskFailure"
    :can-download-report="canDownloadCurrentTask"
    :download-states-by-task-id="downloadStatesByTaskId"
    :session-form="sessionForm"
    :task-user-input="taskUserInput"
    :task-outline="taskOutline"
    :task-citation-style="taskCitationStyle"
    :task-target-word-count="taskTargetWordCount"
    :task-generation-mode="taskGenerationMode"
    :task-venue-label="taskVenueLabel"
    :task-venue-variant="taskVenueVariant"
    :task-authors="taskAuthors"
    :task-control-mode="taskControlMode"
    :session-form-error="sessionFormError"
    :task-form-error="taskFormError"
    :is-create-session-disabled="isCreateSessionDisabled"
    :is-create-task-disabled="isCreateTaskDisabled || inlineClarify.active"
    :inline-clarify-messages="inlineClarify.messages"
    :clarify-processing="inlineClarify.processing"
    :clarify-active="inlineClarify.active"
    :streaming-sections="streamingSections"
    :is-streaming-content="isStreamingContent"
    :archive-analysis="archiveAnalysis"
    @refresh-data="bootstrapPage"
    @update:session-title="sessionForm.title = $event"
    @create-session="handleCreateSession"
    @select-session="selectedSessionId = $event"
    @delete-session="handleDeleteSession"
    @rename-session="handleRenameSession"
    @update:task-user-input="taskUserInput = $event"
    @update:task-outline="taskOutline = $event"
    @update:task-citation-style="taskCitationStyle = $event"
    @update:task-target-word-count="taskTargetWordCount = $event"
    @update:task-generation-mode="taskGenerationMode = $event"
    @update:task-venue-label="taskVenueLabel = $event"
    @update:task-venue-variant="taskVenueVariant = $event"
    @update:task-authors="taskAuthors = $event"
    @update:task-control-mode="taskControlMode = $event"
    @upload-template="handleUploadTemplate"
    @update:selected-api-template="handleSelectApiTemplate"
    @upload-code-files="handleUploadCodeFiles"
    @remove-code-file="handleRemoveCodeFile"
    @apply-prompt="applyPromptSuggestion"
    @create-task="handleClarifyCheck"
    @download-task-report="handleDownloadTaskReportByTask"
    @retry-task="handleRetryTask"
    @cancel-task="handleCancelTask"
    @refresh-task="refreshTaskStatus($event)"
    @refresh-task-list="loadSessionWorkspace(selectedSessionId, false, AUDIT_TRIGGER_SOURCE.USER_ACTION)"
    @upload-files="handleUploadFiles"
    @toggle-file-selection="toggleFileSelection"
    @delete-file="handleDeleteFile"
    @update-task-markdown="handleUpdateTaskMarkdown"
    @clarify-answer="handleInlineClarifyAnswer"
    @clarify-confirm="handleInlineClarifyConfirm"
    @clarify-modify="handleInlineClarifyModify"
    @clarify-skip="handleInlineClarifySkip"
    @show-archive-upload="handleShowArchiveUpload"
  />

  <ArchiveUpload
    :visible="archiveUploadVisible"
    @close="archiveUploadVisible = false"
    @analyzed="handleArchiveAnalyzed"
  />

  <!-- Clarification Loading (during check phase, before questions appear) -->
  <Teleport to="body">
    <div v-if="clarifyState.loading && !clarifyState.active" class="clarify-overlay">
      <div class="clarify-dialog clarify-loading-dialog">
        <div class="clarify-spinner"></div>
        <p class="clarify-loading-text">正在分析输入，判断是否需要澄清…</p>
      </div>
    </div>
  </Teleport>

  <!-- Clarification Dialog -->
  <Teleport to="body">
    <div v-if="clarifyState.active" class="clarify-overlay" @keydown.escape="handleClarifySkip">
      <div class="clarify-dialog">
        <h3>📝 需求澄清</h3>
        <p class="clarify-hint">为了生成更精准的报告，请回答以下问题（标 <span class="required-star">*</span> 为必填）：</p>
        <div v-for="q in clarifyState.questions" :key="q.id" class="clarify-question"
             :class="{ 'clarify-question-required': q.required || q.priority === 'high' }">
          <label :for="'clarify-' + q.id">
            <span v-if="q.required || q.priority === 'high'" class="required-star">* </span>
            <span v-if="q.priority === 'low'" class="priority-low-badge">可选 </span>
            {{ q.question }}
          </label>
          <div v-if="q.options && q.options.length" class="clarify-options">
            <button
              v-for="opt in q.options" :key="opt"
              type="button"
              class="clarify-option-chip"
              :class="{ active: clarifyState.answers[q.id] === opt }"
              @click="clarifyState.answers[q.id] = clarifyState.answers[q.id] === opt ? '' : opt"
            >{{ opt }}</button>
          </div>
          <input
            :id="'clarify-' + q.id"
            v-model="clarifyState.answers[q.id]"
            type="text"
            class="clarify-input"
            :placeholder="q.hint || (q.options?.length ? '也可自由输入...' : '请输入')"
            @keydown.ctrl.enter="handleClarifySubmit"
            @keydown.meta.enter="handleClarifySubmit"
          />
        </div>
        <div class="clarify-actions">
          <button class="btn-clarify-skip" @click="handleClarifySkip" :disabled="clarifyState.loading">
            跳过，直接生成
          </button>
          <button class="btn-clarify-submit" @click="handleClarifySubmit" :disabled="clarifyState.loading">
            {{ clarifyState.loading ? '处理中...' : '确认并生成 (Ctrl+Enter)' }}
          </button>
        </div>
        <p class="clarify-shortcut-hint">Esc 跳过 · Ctrl+Enter 确认</p>
      </div>
    </div>
  </Teleport>

  <!-- Progressive Clarification Chat (deprecated: replaced by inline clarification) -->
  <!--
  <Teleport to="body">
    <div v-if="progressiveClarify.active" class="clarify-overlay" @keydown.escape="handleProgressiveClarifyClose">
      <div class="progressive-clarify-wrapper">
        <ClarificationChat
          ref="clarificationChatRef"
          :visible="progressiveClarify.active"
          :topic="progressiveClarify.topic"
          :session-id="selectedSessionId"
          :loading="clarifyState.loading"
          @finish="handleProgressiveClarifyFinish"
          @close="handleProgressiveClarifyClose"
        />
      </div>
    </div>
  </Teleport>
  -->

  <!-- Reconnection Banner -->
  <Teleport to="body">
    <Transition name="banner-slide">
      <div v-if="reconnecting.active" class="reconnect-banner">
        <div class="reconnect-content">
          <div class="reconnect-spinner"></div>
          <span>{{ reconnecting.message }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Outline Preview Dialog -->
  <Teleport to="body">
    <div v-if="outlinePreview.active" class="clarify-overlay" @keydown.escape="handleOutlineSkip">
      <div class="outline-preview-dialog">
        <h3>📋 大纲预览</h3>
        <p class="clarify-hint">以下是为您生成的报告大纲，可编辑、排序或删除章节：</p>

        <div v-if="outlinePreview.loading" class="outline-preview-loading">
          <div class="clarify-spinner"></div>
          <p class="clarify-loading-text">正在生成大纲…</p>
        </div>

        <div v-else class="outline-sections-list">
          <div
            v-for="(section, idx) in outlinePreview.editedSections"
            :key="idx"
            class="outline-section-item"
          >
            <div class="outline-section-header">
              <span class="outline-section-number">{{ idx + 1 }}</span>
              <input
                v-model="section.title"
                class="outline-section-title-input"
                placeholder="章节标题"
              />
              <div class="outline-section-actions">
                <button
                  class="outline-btn-icon"
                  :disabled="idx === 0"
                  title="上移"
                  @click="handleOutlineMoveUp(idx)"
                >↑</button>
                <button
                  class="outline-btn-icon"
                  :disabled="idx === outlinePreview.editedSections.length - 1"
                  title="下移"
                  @click="handleOutlineMoveDown(idx)"
                >↓</button>
                <button
                  class="outline-btn-icon outline-btn-delete"
                  title="删除"
                  @click="handleOutlineDeleteSection(idx)"
                >✕</button>
              </div>
            </div>
            <textarea
              v-model="section.description"
              class="outline-section-desc-input"
              placeholder="章节描述（可选）"
              rows="2"
            ></textarea>
          </div>

          <button class="outline-btn-add" @click="handleOutlineAddSection">＋ 添加章节</button>
        </div>

        <div class="clarify-actions" v-if="!outlinePreview.loading">
          <button class="btn-clarify-skip" @click="handleOutlineSkip">
            跳过，直接生成
          </button>
          <button class="btn-clarify-submit" @click="handleOutlineConfirm"
            :disabled="outlinePreview.editedSections.length === 0">
            确认生成
          </button>
        </div>
        <p class="clarify-shortcut-hint" v-if="!outlinePreview.loading">Esc 跳过</p>
      </div>
    </div>
  </Teleport>

  <SafetyBlockModal
    :show="showSafetyBlockModal"
    :data="safetyBlockData"
    @close="handleSafetyBlockDecision"
  />
</template>

<style scoped>
.clarify-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.clarify-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 520px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.clarify-dialog h3 {
  margin: 0 0 8px;
  font-size: 18px;
}
.clarify-hint {
  color: #666;
  font-size: 14px;
  margin-bottom: 16px;
}
.clarify-question {
  margin-bottom: 14px;
}
.clarify-question-required {
  border-left: 3px solid var(--primary);
  padding-left: 10px;
}
.required-star {
  color: var(--danger);
  font-weight: 600;
}
.priority-low-badge {
  color: #999;
  font-size: 12px;
  font-weight: 400;
}
.clarify-question label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}
.clarify-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}
.clarify-option-chip {
  padding: 4px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 16px;
  background: #fafafa;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.clarify-option-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.clarify-option-chip.active {
  background: rgba(0, 112, 243, 0.06);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 500;
}
.clarify-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.clarify-input:focus {
  border-color: var(--primary);
}
.clarify-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}
.btn-clarify-skip {
  padding: 8px 20px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.btn-clarify-submit {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}
.btn-clarify-submit:disabled,
.btn-clarify-skip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.clarify-loading-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 32px;
}
.clarify-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: clarify-spin 0.8s linear infinite;
}
@keyframes clarify-spin {
  to { transform: rotate(360deg); }
}
.clarify-loading-text {
  margin-top: 16px;
  color: #666;
  font-size: 14px;
}
.clarify-shortcut-hint {
  text-align: center;
  color: #aaa;
  font-size: 12px;
  margin-top: 12px;
  margin-bottom: 0;
}

/* Outline Preview */
.outline-preview-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 640px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  max-height: 80vh;
  overflow-y: auto;
}
.outline-preview-dialog h3 {
  margin: 0 0 8px;
  font-size: 18px;
}
.outline-preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
}
.outline-sections-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 4px;
}
.outline-section-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}
.outline-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.outline-section-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.outline-section-title-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: border-color 0.2s;
}
.outline-section-title-input:focus {
  border-color: var(--primary);
}
.outline-section-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.outline-btn-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: background 0.15s, color 0.15s;
}
.outline-btn-icon:hover:not(:disabled) {
  background: #f0f0f0;
}
.outline-btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.outline-btn-delete:hover:not(:disabled) {
  background: var(--danger-light);
  color: var(--danger);
  border-color: var(--danger);
}
.outline-section-desc-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.outline-section-desc-input:focus {
  border-color: var(--primary);
}
.outline-btn-add {
  padding: 8px 0;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  color: var(--primary);
  transition: border-color 0.2s, background 0.2s;
}
.outline-btn-add:hover {
  border-color: var(--primary);
  background: rgba(0, 112, 243, 0.04);
}

/* Progressive Clarification Overlay */
.progressive-clarify-wrapper {
  width: 90%;
  max-width: 560px;
}

/* Reconnection Banner */
.reconnect-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10001;
  background: linear-gradient(90deg, #818cf8, #6366f1);
  color: #fff;
  padding: 8px 16px;
  text-align: center;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.reconnect-content {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.reconnect-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: clarify-spin 0.8s linear infinite;
}
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
