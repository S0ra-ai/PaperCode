import { describe, expect, it } from 'vitest';
import { explainTaskFailure } from '@/features/workspace/utils/task-failure';

describe('task failure helper', () => {
  it('classifies missing model configuration errors', () => {
    const failure = explainTaskFailure({
      status: 'failed',
      errorMessage: '模型服务未配置，请检查 MODEL_SERVICE_APP_ID 与 MODEL_SERVICE_SECRET。'
    });

    expect(failure.kind).toBe('config');
    expect(failure.title).toBe('模型服务配置未完成');
    expect(failure.actions[0]).toContain('MODEL_SERVICE_BASE_URL');
  });

  it('classifies file base url accessibility errors', () => {
    const failure = explainTaskFailure({
      status: 'failed',
      errorMessage: '当前附件或模板地址仅本机可访问，远程模型服务无法读取。请检查 FILE_BASE_URL，改成模型服务可访问的公网地址，或先用纯文本任务测试。'
    });

    expect(failure.kind).toBe('file-access');
    expect(failure.title).toBe('附件或模板地址无法被模型服务访问');
    expect(failure.actions[1]).toContain('纯文本任务');
  });

  it('returns generic guidance for unknown failures', () => {
    const failure = explainTaskFailure({
      status: 'failed',
      errorMessage: 'unexpected failure'
    });

    expect(failure.kind).toBe('unknown');
    expect(failure.title).toBe('任务执行失败');
  });
});
