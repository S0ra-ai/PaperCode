export const ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED = 'notAttached';
export const ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL = 'submittedToModel';

export const ATTACHMENT_SUBMISSION_STATE_LABELS = {
  [ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED]: '未附带附件',
  [ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL]: '已提交给模型'
};

const DEFAULT_FILE_NAME = '未命名附件';
const UNAVAILABLE_FILE_NAME = '附件已不可用';

function sanitizeFileName(fileName) {
  if (typeof fileName !== 'string') {
    return '';
  }
  return fileName.trim();
}

export function getSubmissionStateLabel(submissionState) {
  return ATTACHMENT_SUBMISSION_STATE_LABELS[submissionState] || '附件状态未知';
}

export function normalizeUsedFiles(task) {
  const rawFiles = Array.isArray(task?.usedFiles) ? task.usedFiles : [];
  return rawFiles
    .filter((file) => file && typeof file === 'object')
    .map((file) => ({
      fileId: typeof file.fileId === 'string' ? file.fileId : '',
      fileName: sanitizeFileName(file.fileName) || DEFAULT_FILE_NAME
    }))
    .filter((file) => file.fileId || file.fileName);
}

export function buildAttachmentSnapshotFromFiles(files) {
  const usedFiles = (Array.isArray(files) ? files : [])
    .filter((file) => file && typeof file === 'object')
    .map((file) => ({
      fileId: typeof file.fileId === 'string' ? file.fileId : '',
      fileName: sanitizeFileName(file.fileName) || DEFAULT_FILE_NAME
    }))
    .filter((file) => file.fileId || file.fileName);

  const submissionState = usedFiles.length
    ? ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL
    : ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED;

  return {
    usedFilesCount: usedFiles.length,
    usedFiles,
    submissionState,
    submissionStateLabel: getSubmissionStateLabel(submissionState)
  };
}

export function getComposerAttachmentHint(files) {
  const snapshot = buildAttachmentSnapshotFromFiles(files);
  if (!snapshot.usedFilesCount) {
    return '本次未附带附件';
  }
  return `本次任务将使用 ${snapshot.usedFilesCount} 篇附件文献`;
}

export function getTaskAttachmentFeedback(task) {
  const usedFiles = normalizeUsedFiles(task);
  const usedFilesCount = Number.isFinite(task?.usedFilesCount)
    ? Number(task.usedFilesCount)
    : usedFiles.length;
  const submissionState = typeof task?.submissionState === 'string' && task.submissionState
    ? task.submissionState
    : (usedFilesCount > 0 ? ATTACHMENT_SUBMISSION_STATE_SUBMITTED_TO_MODEL : ATTACHMENT_SUBMISSION_STATE_NOT_ATTACHED);

  if (!usedFilesCount) {
    return {
      count: 0,
      files: [],
      submissionState,
      submissionStateLabel: getSubmissionStateLabel(submissionState),
      title: '本轮未附带附件',
      summary: '这次任务只使用了研究问题与提纲，没有向模型附带附件文献。'
    };
  }

  return {
    count: usedFilesCount,
    files: usedFiles.map((file) => ({
      ...file,
      fileName: sanitizeFileName(file.fileName) || UNAVAILABLE_FILE_NAME
    })),
    submissionState,
    submissionStateLabel: getSubmissionStateLabel(submissionState),
    title: `已向模型提交 ${usedFilesCount} 篇附件`,
    summary: '以下附件文献已随本轮任务一起提交给模型，便于后续回看本轮报告使用了哪些资料。'
  };
}

export { DEFAULT_FILE_NAME, UNAVAILABLE_FILE_NAME };
