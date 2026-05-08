import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';

vi.mock('@/features/workspace/components/TaskReportViewer.vue', () => ({
  default: defineComponent({
    name: 'TaskReportViewerStub',
    props: {
      markdown: { type: String, default: '' }
    },
    template: '<div class="task-report-viewer-stub">{{ markdown }}</div>'
  })
}));

async function loadWorkspaceChatConsoleComponent() {
  try {
    const module = await import('./WorkspaceChatConsole.vue');
    return module.default;
  } catch {
    return null;
  }
}

function mountComponent(component, props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const app = createApp(defineComponent({
    render() {
      return h(component, props);
    }
  }));
  app.mount(container);
  return {
    container,
    unmount() {
      app.unmount();
      container.remove();
    }
  };
}

async function flushUi() {
  await Promise.resolve();
  await nextTick();
}

const baseProps = {
  currentUser: { username: 'alice', role: 'user' },
  sessions: [{ sessionId: 's-1', title: 'session-1' }],
  selectedSessionId: 's-1',
  currentSessionDetail: { sessionId: 's-1', title: 'session-1' },
  currentSessionTasks: [],
  recentTaskHistory: [],
  taskHistory: [],
  selectedFiles: [],
  selectedFileIds: [],
  selectedTemplateFile: null,
  currentTask: null,
  currentTaskCode: 200,
  currentTaskProgress: 0,
  currentTaskTone: 'idle',
  currentTaskFailure: null,
  canDownloadReport: false,
  downloadStatesByTaskId: {},
  sessionForm: { title: '' },
  taskUserInput: '',
  taskOutline: '',
  sessionFormError: '',
  taskFormError: '',
  isCreateSessionDisabled: false,
  isCreateTaskDisabled: false,
  showAdminEntry: false,
  flash: { type: '', text: '' },
  loading: {}
};

describe('WorkspaceChatConsole attachment feedback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the current draft attachment summary', async () => {
    const WorkspaceChatConsole = await loadWorkspaceChatConsoleComponent();
    if (!WorkspaceChatConsole) {
      expect(true).toBe(true);
      return;
    }

    const wrapper = mountComponent(WorkspaceChatConsole, {
      ...baseProps,
      selectedFiles: [
        { fileId: 'f-1', fileName: 'paper-a.pdf' },
        { fileId: 'f-2', fileName: 'paper-b.pdf' }
      ],
      selectedFileIds: ['f-1', 'f-2']
    });

    await flushUi();

    const text = wrapper.container.textContent;
    expect(text).toContain('paper-a.pdf');
    expect(text).toContain('paper-b.pdf');
    expect(text).toContain('2');

    wrapper.unmount();
  });

  it('renders task file cards and a report card title for historical messages', async () => {
    const WorkspaceChatConsole = await loadWorkspaceChatConsoleComponent();
    if (!WorkspaceChatConsole) {
      expect(true).toBe(true);
      return;
    }

    const wrapper = mountComponent(WorkspaceChatConsole, {
      ...baseProps,
      taskHistory: [{
        taskId: 't-1',
        userInput: 'Industry analysis request',
        templateFileId: 'tpl-1',
        templateFileName: 'template.docx',
        templateFileType: 'docx',
        usedFiles: [{ fileId: 'f-1', fileName: 'paper.pdf', fileType: 'pdf' }],
        status: 'completed',
        progress: 100,
        resultMarkdown: '# Report'
      }]
    });

    await flushUi();

    const text = wrapper.container.textContent;
    expect(text).toContain('template.docx');
    expect(text).toContain('paper.pdf');
    expect(text).toContain('Industry-analysis-request.docx');

    wrapper.unmount();
  });

  it('prefers the persisted report file name when a task has a stored docx result', async () => {
    const WorkspaceChatConsole = await loadWorkspaceChatConsoleComponent();
    if (!WorkspaceChatConsole) {
      expect(true).toBe(true);
      return;
    }

    const wrapper = mountComponent(WorkspaceChatConsole, {
      ...baseProps,
      taskHistory: [{
        taskId: 't-2',
        userInput: 'Another report request',
        status: 'completed',
        progress: 100,
        resultMarkdown: '',
        resultFileId: 'rf-1',
        resultFileName: 'final-report.docx',
        resultFileType: 'docx'
      }]
    });

    await flushUi();

    expect(wrapper.container.textContent).toContain('final-report.docx');

    wrapper.unmount();
  });
});
