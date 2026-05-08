import { describe, expect, it, vi } from 'vitest';

import { normalizeDownloadError, parseDownloadFileName } from '@/features/workspace/api/task-download';

describe('task-download helpers', () => {
  it('parses UTF-8 content disposition filenames', () => {
    const value = parseDownloadFileName(
      "attachment; filename*=UTF-8''%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A-t-1.docx",
      'fallback.docx'
    );

    expect(value).toBe('研究报告-t-1.docx');
  });

  it('falls back when content disposition is missing', () => {
    expect(parseDownloadFileName('', 'fallback.md')).toBe('fallback.md');
  });

  it('normalizes blob json errors into business errors', async () => {
    const error = {
      response: {
        status: 409,
        data: new Blob([
          JSON.stringify({
            code: 409,
            message: '任务尚未完成，暂时无法下载报告'
          })
        ], { type: 'application/json' })
      }
    };
    const storage = {
      removeItem: vi.fn()
    };
    const location = {
      pathname: '/app'
    };

    const normalized = await normalizeDownloadError(error, storage, location);

    expect(normalized.message).toBe('任务尚未完成，暂时无法下载报告');
    expect(normalized.code).toBe(409);
  });
});
