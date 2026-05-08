import request from '@/shared/api/request';
import { requestTaskReportDownload } from './task-download';
import { resolveApiBaseUrl } from '@/shared/api/request-helpers';

function joinApiPath(baseUrl, path) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedPath = String(path || '').trim().replace(/^\/+/, '');

  if (!normalizedBaseUrl) {
    return `/${normalizedPath}`;
  }
  if (/^https?:\/\//i.test(normalizedBaseUrl)) {
    return `${normalizedBaseUrl}/${normalizedPath}`;
  }
  if (normalizedBaseUrl.startsWith('/')) {
    return `${normalizedBaseUrl}/${normalizedPath}`;
  }
  return `/${normalizedBaseUrl}/${normalizedPath}`;
}

export const submitGenerateTask = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks`, data, config);

export const checkClarification = (data, config = {}) =>
  request.post('/clarify/check', data, config);

export const refineClarification = (data, config = {}) =>
  request.post('/clarify/refine', data, config);

export const previewOutline = (data, config = {}) =>
  request.post('/clarify/preview-outline', data, config);

export const getSessionTasks = (sessionId, config = {}) => request.get(`/sessions/${sessionId}/tasks`, config);

export const getTaskStatus = (taskId, config = {}) => request.get(`/tasks/${taskId}`, config);

export const downloadTaskReport = (taskId, format, config = {}) => requestTaskReportDownload(taskId, format, config);

export const getPaperStageContract = (config = {}) =>
  request.get('/paper/stages', config);

export const resolvePaperFormat = (data, config = {}) =>
  request.post('/paper/format/resolve', data, config);

export const auditPaperCitations = (data, config = {}) =>
  request.post('/paper/citations/audit', data, config);

export const planPaperIntervention = (data, config = {}) =>
  request.post('/paper/interventions/plan', data, config);

export const routePaperInput = (data, config = {}) =>
  request.post('/paper/input/route', data, config);

export const planPaperQuestions = (data, config = {}) =>
  request.post('/paper/questions/plan', data, config);

export const planPaperResearch = (data, config = {}) =>
  request.post('/paper/research/plan', data, config);

export const prefillPaperMetadata = (data, config = {}) =>
  request.post('/paper/metadata/prefill', data, config);

export const suggestPaperCodeDirections = (data, config = {}) =>
  request.post('/paper/code/directions', data, config);

export const ingestPaperMaterials = (data, config = {}) =>
  request.post('/paper/materials/ingest', data, config);

export const browsePaperCode = (data, config = {}) =>
  request.post('/paper/code/browse', data, config);

export const classifyPaperType = (data, config = {}) =>
  request.post('/paper/type/classify', data, config);

export const assessPaperNovelty = (data, config = {}) =>
  request.post('/paper/novelty/assess', data, config);

export const planPaperExperiment = (data, config = {}) =>
  request.post('/paper/experiments/plan', data, config);

export const adjustPaperExperiment = (data, config = {}) =>
  request.post('/paper/experiments/adjust', data, config);

export const auditPaperQuestions = (data, config = {}) =>
  request.post('/paper/questions/audit', data, config);

export const auditPaperMetadata = (data, config = {}) =>
  request.post('/paper/metadata/audit', data, config);

export const auditPaperFigures = (data, config = {}) =>
  request.post('/paper/figures/audit', data, config);

export const retryTask = (taskId, config = {}) => request.post(`/tasks/${taskId}/retry`, null, config);

export const cancelTask = (taskId, config = {}) => request.post(`/tasks/${taskId}/cancel`, null, config);

// ─── 任务中心：用户级任务列表 ────────────────────────────

export const getUserTasks = (params = {}, config = {}) =>
  request.get('/tasks', { params, ...config });

export const regenerateSection = (taskId, sectionIndex, data = {}, config = {}) =>
  request.post(`/tasks/${taskId}/sections/${sectionIndex}/regenerate`, data, config);

export const rewriteSection = (taskId, sectionId, data = {}, config = {}) =>
  request.post(`/tasks/${taskId}/sections/${sectionId}/rewrite`, data, config);

// ─── Active Task Recovery (P2-4) ─────────────────────────

export const getActiveTask = (sessionId, config = {}) =>
  request.get(`/sessions/${sessionId}/tasks/active`, config);

// ─── Progressive Clarification (P3) ─────────────────────

export const clarifyNext = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks/clarify/next`, data, config);

export const clarifyAnswer = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks/clarify/answer`, data, config);

export const clarifySkip = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks/clarify/skip`, data, config);

export const clarifyFinish = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks/clarify/finish`, data, config);

export const extractDocumentInfo = (sessionId, data, config = {}) =>
  request.post(`/sessions/${sessionId}/tasks/clarify/extract-doc`, data, config);

// ─── Archive Analysis ────────────────────────────────────

export const analyzeArchive = (file, config = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/tasks/archive/analyze', formData, {
    ...config,
    headers: {
      ...(config.headers || {}),
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  });
};

// ─── SSE Streaming ───────────────────────────────────────

export function getTaskProgressStreamUrl(taskId, env = import.meta.env) {
  return joinApiPath(
    resolveApiBaseUrl(env),
    `/tasks/${encodeURIComponent(taskId)}/stream`
  );
}

/**
 * Create an SSE stream with automatic reconnection and exponential backoff.
 * Returns an object with { eventSource, close() } where eventSource is reactive.
 */
export function createTaskProgressStream(taskId, options = {}) {
  const EventSourceCtor = options.EventSource
    || (typeof window !== 'undefined' ? window.EventSource : undefined)
    || globalThis.EventSource;

  if (!taskId || typeof EventSourceCtor !== 'function') {
    return null;
  }

  const url = getTaskProgressStreamUrl(taskId, options.env);
  const maxRetries = options.maxRetries ?? 5;
  const baseDelay = options.baseDelay ?? 1000;
  const onReconnect = options.onReconnect ?? (() => {});
  const onGiveUp = options.onGiveUp ?? (() => {});

  let retryCount = 0;
  let closed = false;
  let currentEs = null;
  let retryTimer = null;

  function connect() {
    if (closed) return;
    const es = new EventSourceCtor(url, { withCredentials: true });
    currentEs = es;

    es.onopen = () => {
      retryCount = 0;
    };

    // Forward events to user-provided handlers
    if (options.onMessage) es.onmessage = options.onMessage;
    if (options.onError) {
      const originalOnError = options.onError;
      es.onerror = (evt) => {
        originalOnError(evt);
        handleError();
      };
    } else {
      es.onerror = handleError;
    }

    return es;
  }

  function handleError() {
    if (closed) return;
    if (currentEs) {
      currentEs.close();
      currentEs = null;
    }
    if (retryCount >= maxRetries) {
      onGiveUp();
      return;
    }
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), 30000);
    retryCount++;
    onReconnect(retryCount, delay);
    retryTimer = setTimeout(connect, delay);
  }

  const es = connect();

  return {
    eventSource: es,
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (currentEs) currentEs.close();
    },
    get currentEventSource() {
      return currentEs;
    }
  };
}
