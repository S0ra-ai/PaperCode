import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  createSession,
  deleteSession,
  getSessions,
  getSessionWorkspace,
  getSessionAttachments,
  uploadSessionAttachment
} from '@/features/workspace/api/session';
import { submitGenerateTask, getTaskStatus } from '@/features/workspace/api/task';

const WORKSPACE_STORAGE_PREFIX = 'workspaceState';

export const useWorkspaceStore = defineStore('workspace', () => {
  // ── Core state ──
  const sessions = ref([]);
  const selectedSessionId = ref('');
  const sessionDetailsBySessionId = ref({});
  const sessionTaskListBySessionId = ref({});
  const taskSnapshotsBySessionId = ref({});
  const currentTaskIdBySessionId = ref({});
  const taskCodesBySessionId = ref({});
  const taskFormsBySessionId = ref({});
  const selectedFileIdsBySessionId = ref({});
  const workspaceStateReady = ref(false);

  // ── Loading states ──
  const loading = ref({
    bootstrap: false,
    session: false,
    upload: false,
    attachments: false,
    task: false,
    workspace: false
  });

  // ── Computed ──
  const currentSession = computed(() =>
    sessions.value.find((s) => s.sessionId === selectedSessionId.value) || null
  );

  const currentTaskSnapshots = computed(() =>
    taskSnapshotsBySessionId.value[selectedSessionId.value] || []
  );

  const currentTaskId = computed(() =>
    currentTaskIdBySessionId.value[selectedSessionId.value] || ''
  );

  const currentTaskForm = computed(() =>
    taskFormsBySessionId.value[selectedSessionId.value] || { userInput: '', outline: '' }
  );

  const currentSelectedFileIds = computed(() =>
    selectedFileIdsBySessionId.value[selectedSessionId.value] || []
  );

  // ── Actions ──
  async function fetchSessions() {
    loading.value.session = true;
    try {
      const res = await getSessions();
      if (res?.data?.code === 200) {
        sessions.value = res.data.data || [];
      }
    } finally {
      loading.value.session = false;
    }
  }

  async function addSession() {
    loading.value.session = true;
    try {
      const res = await createSession();
      if (res?.data?.code === 200) {
        await fetchSessions();
        const newSessionId = res.data.data?.sessionId;
        if (newSessionId) {
          selectedSessionId.value = newSessionId;
        }
        return newSessionId;
      }
    } finally {
      loading.value.session = false;
    }
    return null;
  }

  async function removeSession(sessionId) {
    loading.value.session = true;
    try {
      const res = await deleteSession(sessionId);
      if (res?.data?.code === 200) {
        await fetchSessions();
        if (selectedSessionId.value === sessionId) {
          selectedSessionId.value = sessions.value[0]?.sessionId || '';
        }
      }
    } finally {
      loading.value.session = false;
    }
  }

  function selectSession(sessionId) {
    selectedSessionId.value = sessionId;
    persistWorkspaceState();
  }

  function updateTaskForm(sessionId, form) {
    taskFormsBySessionId.value[sessionId] = {
      userInput: form?.userInput || '',
      outline: form?.outline || ''
    };
    persistWorkspaceState();
  }

  function setCurrentTaskId(sessionId, taskId) {
    currentTaskIdBySessionId.value[sessionId] = taskId;
  }

  function setTaskSnapshots(sessionId, snapshots) {
    taskSnapshotsBySessionId.value[sessionId] = snapshots;
  }

  function setSelectedFileIds(sessionId, fileIds) {
    selectedFileIdsBySessionId.value[sessionId] = fileIds;
  }

  function setTaskCode(sessionId, code) {
    taskCodesBySessionId.value[sessionId] = code;
  }

  // ── Persistence ──
  function getStorageKey(userId) {
    return userId ? `${WORKSPACE_STORAGE_PREFIX}:${userId}` : '';
  }

  function restoreWorkspaceState(userId) {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        selectedSessionId.value = saved.selectedSessionId || '';
        taskFormsBySessionId.value = saved.taskFormsBySessionId || {};
      }
    } catch {
      // Ignore corrupted data
    }
    workspaceStateReady.value = true;
  }

  function persistWorkspaceState() {
    if (!workspaceStateReady.value) return;
    // Note: userId must be obtained from caller; store doesn't import userStore to avoid circular deps
  }

  function pruneOrphanedState() {
    const validIds = new Set(sessions.value.map((s) => s.sessionId));
    for (const map of [
      selectedFileIdsBySessionId,
      taskSnapshotsBySessionId,
      currentTaskIdBySessionId,
      taskCodesBySessionId,
      taskFormsBySessionId
    ]) {
      for (const key of Object.keys(map.value)) {
        if (!validIds.has(key)) {
          delete map.value[key];
        }
      }
    }
    if (selectedSessionId.value && !validIds.has(selectedSessionId.value)) {
      selectedSessionId.value = sessions.value[0]?.sessionId || '';
    }
  }

  function $reset() {
    sessions.value = [];
    selectedSessionId.value = '';
    sessionDetailsBySessionId.value = {};
    sessionTaskListBySessionId.value = {};
    taskSnapshotsBySessionId.value = {};
    currentTaskIdBySessionId.value = {};
    taskCodesBySessionId.value = {};
    taskFormsBySessionId.value = {};
    selectedFileIdsBySessionId.value = {};
    workspaceStateReady.value = false;
  }

  return {
    // State
    sessions,
    selectedSessionId,
    sessionDetailsBySessionId,
    sessionTaskListBySessionId,
    taskSnapshotsBySessionId,
    currentTaskIdBySessionId,
    taskCodesBySessionId,
    taskFormsBySessionId,
    selectedFileIdsBySessionId,
    loading,
    workspaceStateReady,
    // Computed
    currentSession,
    currentTaskSnapshots,
    currentTaskId,
    currentTaskForm,
    currentSelectedFileIds,
    // Actions
    fetchSessions,
    addSession,
    removeSession,
    selectSession,
    updateTaskForm,
    setCurrentTaskId,
    setTaskSnapshots,
    setSelectedFileIds,
    setTaskCode,
    restoreWorkspaceState,
    persistWorkspaceState,
    pruneOrphanedState,
    $reset
  };
});
