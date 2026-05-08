import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED,
  ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL,
  buildAttachmentSnapshotFromFiles,
  getComposerAttachmentHint,
  getTaskAttachmentFeedback,
  normalizeUsedFiles
} from './task-attachments';

describe('task attachments helpers', () => {
  it('builds optimistic attachment snapshot from selected files', () => {
    expect(buildAttachmentSnapshotFromFiles([
      { fileId: 'f-1', fileName: 'paper-a.pdf' },
      { fileId: 'f-2', fileName: 'paper-b.pdf' }
    ])).toEqual({
      usedFilesCount: 2,
      usedFiles: [
        { fileId: 'f-1', fileName: 'paper-a.pdf' },
        { fileId: 'f-2', fileName: 'paper-b.pdf' }
      ],
      submissionState: ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL,
      submissionStateLabel: '已提交给模型'
    });
  });

  it('returns empty snapshot when no files are attached', () => {
    expect(buildAttachmentSnapshotFromFiles([])).toEqual({
      usedFilesCount: 0,
      usedFiles: [],
      submissionState: ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED,
      submissionStateLabel: '未附带附件'
    });
    expect(getComposerAttachmentHint([])).toBe('本次未附带附件');
  });

  it('normalizes server returned used files', () => {
    expect(normalizeUsedFiles({
      usedFiles: [
        { fileId: 'f-1', fileName: ' report.pdf ' },
        { fileId: '', fileName: '附件已不可用' },
        null
      ]
    })).toEqual([
      { fileId: 'f-1', fileName: 'report.pdf' },
      { fileId: '', fileName: '附件已不可用' }
    ]);
  });

  it('builds task attachment feedback for successful submission snapshots', () => {
    expect(getTaskAttachmentFeedback({
      usedFilesCount: 2,
      usedFiles: [
        { fileId: 'f-1', fileName: 'paper-a.pdf' },
        { fileId: 'f-2', fileName: 'paper-b.pdf' }
      ],
      submissionState: ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL
    })).toMatchObject({
      count: 2,
      title: '已向模型提交 2 篇附件',
      submissionState: ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL
    });
  });

  it('builds task attachment feedback for tasks without attachments', () => {
    expect(getTaskAttachmentFeedback({
      usedFilesCount: 0,
      usedFiles: []
    })).toMatchObject({
      count: 0,
      title: '本轮未附带附件',
      submissionState: ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED
    });
  });
});
