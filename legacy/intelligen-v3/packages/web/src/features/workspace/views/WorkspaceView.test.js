import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia } from 'pinia';

const pushMock = vi.fn();
const getUserInfoMock = vi.fn();
const getSessionsMock = vi.fn();
const getSessionAttachmentsMock = vi.fn();
const uploadSessionAttachmentMock = vi.fn();
const deleteFileMock = vi.fn();
const uploadFileMock = vi.fn();
const getSessionWorkspaceMock = vi.fn();
const submitGenerateTaskMock = vi.fn();
const getTaskStatusMock = vi.fn();
const createTaskProgressStreamMock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock('@/features/auth/api/auth', () => ({
  getUserInfo: (...args) => getUserInfoMock(...args)
}));

vi.mock('@/features/admin/api/admin', () => ({
  forceDeleteSessionAsAdmin: vi.fn()
}));

vi.mock('@/features/workspace/api/file', () => ({
  deleteFile: (...args) => deleteFileMock(...args),
  uploadFile: (...args) => uploadFileMock(...args)
}));

vi.mock('@/features/workspace/api/session', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionAttachments: (...args) => getSessionAttachmentsMock(...args),
  getSessionWorkspace: (...args) => getSessionWorkspaceMock(...args),
  getSessions: (...args) => getSessionsMock(...args),
  uploadSessionAttachment: (...args) => uploadSessionAttachmentMock(...args)
}));

vi.mock('@/features/workspace/api/task', () => ({
  createTaskProgressStream: (...args) => createTaskProgressStreamMock(...args),
  downloadTaskReport: vi.fn(),
  getTaskStatus: (...args) => getTaskStatusMock(...args),
  submitGenerateTask: (...args) => submitGenerateTaskMock(...args),
  checkClarification: vi.fn().mockRejectedValue(new Error('not mocked')),
  refineClarification: vi.fn().mockRejectedValue(new Error('not mocked')),
  retryTask: vi.fn(),
  cancelTask: vi.fn(),
  previewOutline: vi.fn().mockRejectedValue(new Error('not mocked')),
  regenerateSection: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspaceChatConsole.vue', () => ({
  default: defineComponent({
    name: 'WorkspaceChatConsoleStub',
    props: {
      currentSessionDetail: { type: Object, default: null },
      selectedFiles: { type: Array, default: () => [] },
      taskHistory: { type: Array, default: () => [] },
      files: { type: Array, default: () => [] },
      flash: { type: Object, default: () => ({ type: '', text: '' }) }
    },
    emits: [
      'upload-files',
      'upload-template',
      'toggle-file-selection',
      'update:task-user-input',
      'create-task'
    ],
    setup(props, { emit }) {
      return {
        emitUpload: () => emit('upload-files', {
          target: {
            files: [{ name: 'upload.pdf', type: 'application/pdf' }],
            value: 'selected'
          }
        }),
        emitUploadTemplate: () => emit('upload-template', {
          target: {
            files: [{ name: 'template.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
            value: 'selected-template'
          }
        }),
        emitSetTaskInput: () => emit('update:task-user-input', 'analyze sample'),
        emitCreateTask: () => emit('create-task'),
        selectedFileNames: () => props.selectedFiles.map((file) => file.fileName).join('|'),
        taskAttachmentNames: () => props.taskHistory
          .flatMap((task) => Array.isArray(task.usedFiles) ? task.usedFiles : [])
          .map((file) => file.fileName)
          .join('|'),
        taskStatuses: () => props.taskHistory
          .map((task) => `${task.taskId}:${task.status}:${task.progress ?? ''}`)
          .join('|'),
        taskIds: () => props.taskHistory.map((task) => task.taskId).join('|'),
        taskCount: () => props.taskHistory.length
      };
    },
    template: `
      <div>
        <button data-testid="trigger-upload" type="button" @click="emitUpload">upload</button>
        <button data-testid="trigger-upload-template" type="button" @click="emitUploadTemplate">upload-template</button>
        <button data-testid="set-task-input" type="button" @click="emitSetTaskInput">set-input</button>
        <button data-testid="trigger-create-task" type="button" @click="emitCreateTask">create</button>
        <div data-testid="session-title">{{ currentSessionDetail?.title || '' }}</div>
        <div data-testid="selected-files">{{ selectedFileNames() }}</div>
        <div data-testid="task-attachment-names">{{ taskAttachmentNames() }}</div>
        <div data-testid="task-statuses">{{ taskStatuses() }}</div>
        <div data-testid="task-ids">{{ taskIds() }}</div>
        <div data-testid="task-count">{{ taskCount() }}</div>
        <div data-testid="flash-text">{{ flash.text }}</div>
      </div>
    `
  })
}));

import WorkspaceView from './WorkspaceView.vue';

function mountView(component) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const app = createApp(component);
  app.use(createPinia());
  app.mount(container);
  return {
    container,
    unmount() {
      app.unmount();
      container.remove();
    }
  };
}

async function flushUi(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

function mockBootstrapData() {
  getUserInfoMock.mockResolvedValue({
    code: 200,
    data: {
      userId: 'u-1',
      username: 'alice',
      nickname: 'Alice',
      role: 'user'
    }
  });
  getSessionsMock.mockResolvedValue({
    code: 200,
    data: [{ sessionId: 's-1', title: 'session-1' }]
  });
  getSessionAttachmentsMock.mockResolvedValue({
    code: 200,
    data: [
      { fileId: 'f-existing', fileName: 'existing-paper.pdf', fileType: 'pdf' }
    ]
  });
}

function createFakeProgressStream() {
  const es = {
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onerror: null
  };
  return {
    eventSource: es,
    close: vi.fn(() => es.close()),
    get currentEventSource() { return es; },
    // Expose es handlers for test assertions
    get onopen() { return es.onopen; },
    set onopen(fn) { es.onopen = fn; },
    get onmessage() { return es.onmessage; },
    set onmessage(fn) { es.onmessage = fn; },
    get onerror() { return es.onerror; },
    set onerror(fn) { es.onerror = fn; },
  };
}

describe('WorkspaceView attachment workflow', () => {
  beforeEach(() => {
    pushMock.mockReset();
    getUserInfoMock.mockReset();
    getSessionsMock.mockReset();
    getSessionAttachmentsMock.mockReset();
    uploadSessionAttachmentMock.mockReset();
    deleteFileMock.mockReset();
    uploadFileMock.mockReset();
    getSessionWorkspaceMock.mockReset();
    submitGenerateTaskMock.mockReset();
    getTaskStatusMock.mockReset();
    createTaskProgressStreamMock.mockReset();
    createTaskProgressStreamMock.mockReturnValue(null);

    localStorage.setItem('userInfo', JSON.stringify({
      userId: 'u-1',
      username: 'alice',
      nickname: 'Alice',
      role: 'user'
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps historical task attachments visible without restoring them as current draft', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [{
          taskId: 't-1',
          sessionId: 's-1',
          status: 'completed',
          progress: 100,
          userInput: 'analyze sample',
          resultMarkdown: '# report',
          usedFilesCount: 1,
          usedFiles: [{ fileId: 'f-existing', fileName: 'existing-paper.pdf' }],
          submissionState: 'submittedToModel'
        }],
        currentTask: null,
        currentTaskCode: 200
      }
    });

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    expect(wrapper.container.querySelector('[data-testid="session-title"]')?.textContent).toContain('session-1');
    expect(wrapper.container.querySelector('[data-testid="selected-files"]')?.textContent).toBe('');
    expect(wrapper.container.querySelector('[data-testid="task-attachment-names"]')?.textContent).toContain('existing-paper.pdf');

    wrapper.unmount();
  });

  it('uses realtime task stream for active workspace tasks and refreshes terminal state', async () => {
    vi.useFakeTimers();
    try {
      mockBootstrapData();
      localStorage.setItem('workspaceState:u-1', JSON.stringify({
        selectedSessionId: 's-1',
        taskFormsBySessionId: {}
      }));

      const progressStream = createFakeProgressStream();
      createTaskProgressStreamMock.mockReturnValue(progressStream);
      getSessionWorkspaceMock.mockResolvedValue({
        code: 200,
        data: {
          session: { sessionId: 's-1', title: 'session-1' },
          tasks: [{
            taskId: 't-1',
            sessionId: 's-1',
            status: 'processing',
            progress: 25,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }]
        }
      });
      getTaskStatusMock.mockResolvedValue({
        code: 200,
        message: 'done',
        data: {
          taskId: 't-1',
          sessionId: 's-1',
          status: 'completed',
          progress: 100,
          resultMarkdown: '# report',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
          completedAt: '2024-01-01T00:01:00Z'
        }
      });

      const wrapper = mountView(WorkspaceView);
      await flushUi(6);

      expect(createTaskProgressStreamMock).toHaveBeenCalledWith('t-1', expect.any(Object));
      expect(wrapper.container.querySelector('[data-testid="task-statuses"]')?.textContent).toContain('t-1:processing:25');

      progressStream.onmessage?.({
        data: JSON.stringify({
          taskId: 't-1',
          sessionId: 's-1',
          status: 'processing',
          progress: 50,
          currentSection: 1,
          totalSections: 2
        })
      });
      vi.advanceTimersByTime(250);
      await flushUi(6);
      expect(wrapper.container.querySelector('[data-testid="task-statuses"]')?.textContent).toContain('t-1:processing:50');

      progressStream.onmessage?.({
        data: JSON.stringify({
          taskId: 't-1',
          sessionId: 's-1',
          status: 'completed',
          progress: 100
        })
      });
      await flushUi(8);

      expect(progressStream.close).toHaveBeenCalled();
      expect(getTaskStatusMock).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          headers: {
            'X-Audit-Trigger': 'AUTO_REFRESH'
          }
        })
      );

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to polling when the realtime task stream errors', async () => {
    vi.useFakeTimers();
    try {
      const setIntervalSpy = vi.spyOn(window, 'setInterval');
      mockBootstrapData();
      localStorage.setItem('workspaceState:u-1', JSON.stringify({
        selectedSessionId: 's-1',
        taskFormsBySessionId: {}
      }));

      const progressStream = createFakeProgressStream();
      createTaskProgressStreamMock.mockReturnValue(progressStream);
      getSessionWorkspaceMock.mockResolvedValue({
        code: 200,
        data: {
          session: { sessionId: 's-1', title: 'session-1' },
          tasks: [{
            taskId: 't-1',
            sessionId: 's-1',
            status: 'processing',
            progress: 10,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }]
        }
      });

      const wrapper = mountView(WorkspaceView);
      await flushUi(6);

      const initialIntervalCalls = setIntervalSpy.mock.calls.length;

      // Extract the onGiveUp callback passed to createTaskProgressStream
      const callArgs = createTaskProgressStreamMock.mock.calls[0];
      const options = callArgs[1];
      // Simulate the stream giving up on retries
      options.onGiveUp();
      await flushUi(4);

      expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(initialIntervalCalls);

      wrapper.unmount();
      setIntervalSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uploads session attachments into the current draft and clears them after submit', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });

    uploadSessionAttachmentMock.mockResolvedValue({
      code: 200,
      data: { fileId: 'f-up-1', fileName: 'upload-paper.pdf', fileType: 'pdf' }
    });
    uploadFileMock.mockResolvedValue({
      code: 200,
      data: { fileId: 'f-template-1', fileName: 'template.docx', fileType: 'docx' }
    });
    submitGenerateTaskMock.mockResolvedValue({
      code: 200,
      data: {
        taskId: 't-new',
        sessionId: 's-1',
        status: 'pending'
      }
    });
    getTaskStatusMock.mockResolvedValue({
      code: 202,
      message: 'task processing',
      data: {
        taskId: 't-new',
        sessionId: 's-1',
        status: 'pending',
        progress: 0,
        usedFilesCount: 1,
        usedFiles: [{ fileId: 'f-up-1', fileName: 'upload-paper.pdf' }],
        submissionState: 'submittedToModel'
      }
    });

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="trigger-upload"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(6);

    expect(uploadSessionAttachmentMock).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({ name: 'upload.pdf' }),
      expect.objectContaining({
        headers: {
          'X-Audit-Trigger': 'USER_ACTION'
        }
      })
    );
    expect(wrapper.container.querySelector('[data-testid="selected-files"]')?.textContent).toContain('upload-paper.pdf');

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-upload-template"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi();
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(8);

    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'template.docx' }),
      expect.objectContaining({
        headers: {
          'X-Audit-Trigger': 'USER_ACTION'
        }
      })
    );
    expect(submitGenerateTaskMock).toHaveBeenCalledWith(
      's-1',
      {
        userInput: 'analyze sample',
        outline: null,
        templateFileId: 'f-template-1',
        userFileIds: ['f-up-1'],
        requirement: null,
        citationStyle: 'gb'
      },
      expect.objectContaining({
        headers: {
          'X-Audit-Trigger': 'USER_ACTION'
        }
      })
    );
    expect(wrapper.container.querySelector('[data-testid="selected-files"]')?.textContent).toBe('');

    wrapper.unmount();
  });

  it('surfaces template upload failures without creating a failed task placeholder', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });
    uploadFileMock.mockRejectedValue(new Error('template upload failed'));

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-upload-template"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi();
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(6);

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(submitGenerateTaskMock).not.toHaveBeenCalled();
    expect(wrapper.container.querySelector('[data-testid="task-ids"]')?.textContent).toBe('');
    expect(wrapper.container.querySelector('[data-testid="task-count"]')?.textContent).toBe('0');
    expect(wrapper.container.querySelector('[data-testid="flash-text"]')?.textContent).toContain('template upload failed');

    wrapper.unmount();
  });

  it('cleans up uploaded template when task submission fails before task creation succeeds', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });

    uploadFileMock.mockResolvedValue({
      code: 200,
      data: { fileId: 'f-template-1', fileName: 'template.docx', fileType: 'docx' }
    });
    submitGenerateTaskMock.mockRejectedValue(Object.assign(new Error('submit failed'), { code: 500 }));
    deleteFileMock.mockResolvedValue({ code: 200 });

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-upload-template"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi();
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(8);

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(submitGenerateTaskMock).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith('f-template-1');
    expect(wrapper.container.querySelector('[data-testid="task-count"]')?.textContent).toBe('1');
    expect(wrapper.container.querySelector('[data-testid="flash-text"]')?.textContent).toContain('submit failed');

    wrapper.unmount();
  });

  it('intercepts 403 safety blocks without creating a failed placeholder and cleans up template', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });

    uploadFileMock.mockResolvedValue({
      code: 200,
      data: { fileId: 'f-template-1', fileName: 'template.docx', fileType: 'docx' }
    });
    const errorWithSafetyData = new Error('检测到4个严重敏感词，且包含生成请求，已阻止');
    Object.assign(errorWithSafetyData, {
      code: 403,
      data: {
        action: 'block',
        risk_level: 'critical',
        detected_keywords: ['毒品', '制造毒品']
      }
    });
    submitGenerateTaskMock.mockRejectedValue(errorWithSafetyData);
    deleteFileMock.mockResolvedValue({ code: 200 });

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-upload-template"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi();
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(8);

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(submitGenerateTaskMock).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith('f-template-1');
    // Important: Task count should be 0 because we do NOT push a failed 403 placeholder
    expect(wrapper.container.querySelector('[data-testid="task-count"]')?.textContent).toBe('0');
    // Verify that the safety modal renders implicitly by lack of flash error message
    expect(wrapper.container.querySelector('[data-testid="flash-text"]')?.textContent).toBe('');
    // Ensure the modal actually triggered by rendering '内容安全拦截'
    expect(wrapper.container.innerHTML).toContain('内容安全拦截');
    expect(wrapper.container.innerHTML).toContain('检测到违禁词: 毒品, 制造毒品');

    wrapper.unmount();
  });

  it('intercepts 403 review responses and rewrites them to detected keywords', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });

    const reviewSafetyError = new Error('检测到需要审核的内容，涉及类别: GFW补充词库');
    Object.assign(reviewSafetyError, {
      code: 403,
      data: {
        action: 'review',
        risk_level: 'medium',
        detected_keywords: ['翻墙', 'VPN'],
        categories: ['GFW补充词库']
      }
    });
    submitGenerateTaskMock.mockRejectedValue(reviewSafetyError);

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(8);

    expect(submitGenerateTaskMock).toHaveBeenCalledTimes(1);
    expect(wrapper.container.querySelector('[data-testid="task-count"]')?.textContent).toBe('0');
    expect(wrapper.container.querySelector('[data-testid="flash-text"]')?.textContent).toBe('');
    expect(wrapper.container.innerHTML).toContain('内容安全拦截');
    expect(wrapper.container.innerHTML).toContain('检测到违禁词: 翻墙, VPN');

    wrapper.unmount();
  });

  it('hides legacy review wording when detected keywords are missing', async () => {
    mockBootstrapData();
    localStorage.setItem('workspaceState:u-1', JSON.stringify({
      selectedSessionId: 's-1',
      taskFormsBySessionId: {}
    }));

    getSessionWorkspaceMock.mockResolvedValue({
      code: 200,
      data: {
        session: { sessionId: 's-1', title: 'session-1' },
        tasks: [],
        taskSnapshots: [],
        currentTask: null,
        currentTaskCode: 200
      }
    });
    getSessionAttachmentsMock.mockResolvedValue({
      code: 200,
      data: []
    });

    const reviewSafetyError = new Error('检测到需要审核的内容，涉及类别: GFW补充词库');
    Object.assign(reviewSafetyError, {
      code: 403,
      data: {
        action: 'review',
        risk_level: 'medium',
        detected_keywords: [],
        categories: ['GFW补充词库']
      }
    });
    submitGenerateTaskMock.mockRejectedValue(reviewSafetyError);

    const wrapper = mountView(WorkspaceView);
    await flushUi(6);

    wrapper.container.querySelector('[data-testid="set-task-input"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    wrapper.container.querySelector('[data-testid="trigger-create-task"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushUi(8);

    expect(submitGenerateTaskMock).toHaveBeenCalledTimes(1);
    expect(wrapper.container.innerHTML).toContain('内容安全拦截');
    expect(wrapper.container.innerHTML).toContain('检测到敏感或违禁内容，请修改后重新提交。');
    expect(wrapper.container.innerHTML).not.toContain('检测到需要审核的内容，涉及类别: GFW补充词库');

    wrapper.unmount();
  });
});
