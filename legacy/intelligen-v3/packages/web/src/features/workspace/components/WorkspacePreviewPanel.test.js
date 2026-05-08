import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';

const downloadTaskReportMock = vi.fn();
const getFileDetailMock = vi.fn();
const regenerateSectionMock = vi.fn();
const renderAsyncMock = vi.fn(() => Promise.resolve());

vi.mock('@/features/workspace/api/task', () => ({
  downloadTaskReport: (...args) => downloadTaskReportMock(...args),
  regenerateSection: (...args) => regenerateSectionMock(...args)
}));

vi.mock('@/features/workspace/api/file', () => ({
  getFileDetail: (...args) => getFileDetailMock(...args)
}));

vi.mock('docx-preview', () => ({
  renderAsync: (...args) => renderAsyncMock(...args)
}));

async function loadWorkspacePreviewPanelComponent() {
  const module = await import('./WorkspacePreviewPanel.vue');
  return module.default;
}

function mountComponent(component, props = {}) {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('WorkspacePreviewPanel loading containers', () => {
  beforeEach(() => {
    downloadTaskReportMock.mockReset();
    getFileDetailMock.mockReset();
    regenerateSectionMock.mockReset();
    renderAsyncMock.mockReset();
    renderAsyncMock.mockImplementation(() => Promise.resolve());
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.document.body.innerHTML = '';
  });

  it('keeps the report docx container mounted while the docx blob is still loading', async () => {
    const WorkspacePreviewPanel = await loadWorkspacePreviewPanelComponent();
    const deferred = createDeferred();
    downloadTaskReportMock.mockReturnValue(deferred.promise);

    const wrapper = mountComponent(WorkspacePreviewPanel, {
      preview: {
        kind: 'report',
        taskId: 't-1',
        title: 'report.docx',
        markdown: '# Report',
        status: 'completed'
      },
      downloadStates: { docx: false, md: false }
    });

    await flushUi();

    expect(downloadTaskReportMock).toHaveBeenCalledWith('t-1', 'docx');
    expect(wrapper.container.querySelector('.workspace-preview-docx')).not.toBeNull();
    expect(wrapper.container.querySelector('.workspace-preview-status-overlay')).not.toBeNull();

    deferred.resolve({ blob: new globalThis.Blob(['done']) });
    await flushUi();
    wrapper.unmount();
  });

  it('keeps the file docx container mounted while the source file is still loading', async () => {
    const WorkspacePreviewPanel = await loadWorkspacePreviewPanelComponent();
    const deferred = createDeferred();
    globalThis.fetch.mockReturnValue(deferred.promise);

    const wrapper = mountComponent(WorkspacePreviewPanel, {
      preview: {
        kind: 'file',
        fileId: '',
        fileName: 'template.docx',
        fileType: 'docx',
        fileUrl: '/mock/template.docx',
        title: 'template.docx'
      },
      downloadStates: { docx: false, md: false }
    });

    await flushUi();

    expect(globalThis.fetch).toHaveBeenCalledWith('/mock/template.docx');
    expect(wrapper.container.querySelector('.workspace-preview-docx')).not.toBeNull();
    expect(wrapper.container.querySelector('.workspace-preview-status-overlay')).not.toBeNull();

    deferred.resolve({
      ok: true,
      blob: async () => new globalThis.Blob(['done'])
    });
    await flushUi();
    wrapper.unmount();
  });

  it('renders the resolved report docx with the bundled docx-preview renderer', async () => {
    const WorkspacePreviewPanel = await loadWorkspacePreviewPanelComponent();
    downloadTaskReportMock.mockResolvedValue({ blob: new globalThis.Blob(['done']) });

    const wrapper = mountComponent(WorkspacePreviewPanel, {
      preview: {
        kind: 'report',
        taskId: 't-2',
        title: 'report.docx',
        markdown: '# Report',
        status: 'completed'
      },
      downloadStates: { docx: false, md: false }
    });

    await vi.waitFor(() => {
      expect(renderAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(renderAsyncMock.mock.calls[0][1]).toBe(wrapper.container.querySelector('.workspace-preview-docx'));

    wrapper.unmount();
  });

  it('shows parsed evidence details when a citation chip is clicked', async () => {
    const WorkspacePreviewPanel = await loadWorkspacePreviewPanelComponent();
    downloadTaskReportMock.mockResolvedValue({ blob: new globalThis.Blob(['done']) });

    const wrapper = mountComponent(WorkspacePreviewPanel, {
      preview: {
        kind: 'report',
        taskId: 't-3',
        title: 'report.docx',
        status: 'completed',
        markdown: [
          '# 1 引言',
          '',
          '这里先引用综述 [1]，再引用方法 [2]。',
          '',
          '# 6 参考文献',
          '',
          '[1] LeCun Y, Bengio Y. Deep Learning Survey. Nature, 2015. https://doi.org/10.1234',
          '',
          '[2] Vaswani A. Attention Is All You Need. NeurIPS, 2017. https://arxiv.org/abs/1706.03762'
        ].join('\n')
      },
      downloadStates: { docx: false, pdf: false, md: false }
    });

    await flushUi();

    const evidenceToggle = [...wrapper.container.querySelectorAll('.workspace-preview-action-btn')]
      .find((button) => button.textContent.includes('证据视图'));
    expect(evidenceToggle).toBeTruthy();

    evidenceToggle.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
    await flushUi();

    await vi.waitFor(() => {
      expect(wrapper.container.querySelector('[data-citation-number="2"]')).not.toBeNull();
      expect(wrapper.container.querySelector('.workspace-preview-reference-card')).not.toBeNull();
    });

    const citationChip = wrapper.container.querySelector('[data-citation-number="2"]');
    citationChip.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
    await flushUi();

    expect(wrapper.container.textContent).toContain('Attention Is All You Need');
    expect(wrapper.container.textContent).toContain('NeurIPS');
    expect(wrapper.container.textContent).toContain('点击位置');
    expect(wrapper.container.textContent).toContain('1 引言');
  });
});
