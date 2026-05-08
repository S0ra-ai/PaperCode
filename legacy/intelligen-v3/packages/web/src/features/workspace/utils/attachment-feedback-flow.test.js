import { describe, expect, it } from 'vitest';

import {
  buildAttachmentSnapshotFromFiles,
  getComposerAttachmentHint,
  getTaskAttachmentFeedback
} from './task-attachments';

describe('attachment feedback flow', () => {
  it('shows uploaded attachment count and names in the snapshot', () => {
    const snapshot = buildAttachmentSnapshotFromFiles([
      { fileId: 'f-1', fileName: 'paper-a.pdf' },
      { fileId: 'f-2', fileName: 'paper-b.pdf' }
    ]);

    expect(snapshot).toEqual({
      usedFilesCount: 2,
      usedFiles: [
        { fileId: 'f-1', fileName: 'paper-a.pdf' },
        { fileId: 'f-2', fileName: 'paper-b.pdf' }
      ],
      submissionState: 'submittedToModel',
      submissionStateLabel: '已提交给模型'
    });
  });

  it('shows the attachment count before submitting a task', () => {
    expect(getComposerAttachmentHint([
      { fileId: 'f-1', fileName: 'paper-a.pdf' },
      { fileId: 'f-2', fileName: 'paper-b.pdf' },
      { fileId: 'f-3', fileName: 'paper-c.pdf' }
    ])).toBe('本次任务将使用 3 篇附件文献');
  });

  it('keeps a separate attachment snapshot for each task in multi-round history', () => {
    const taskHistory = [
      getTaskAttachmentFeedback({
        taskId: 'task-1',
        usedFilesCount: 1,
        usedFiles: [{ fileId: 'f-1', fileName: 'paper-a.pdf' }],
        submissionState: 'submittedToModel'
      }),
      getTaskAttachmentFeedback({
        taskId: 'task-2',
        usedFilesCount: 2,
        usedFiles: [
          { fileId: 'f-2', fileName: 'paper-b.pdf' },
          { fileId: 'f-3', fileName: 'paper-c.pdf' }
        ],
        submissionState: 'submittedToModel'
      })
    ];

    expect(taskHistory.map((task) => task.count)).toEqual([1, 2]);
    expect(taskHistory[0].files).toEqual([
      { fileId: 'f-1', fileName: 'paper-a.pdf' }
    ]);
    expect(taskHistory[1].files).toEqual([
      { fileId: 'f-2', fileName: 'paper-b.pdf' },
      { fileId: 'f-3', fileName: 'paper-c.pdf' }
    ]);
  });
});
