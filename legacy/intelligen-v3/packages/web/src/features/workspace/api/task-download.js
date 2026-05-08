import axios from 'axios';

import {
  normalizeRequestError,
  resolveApiBaseUrl
} from '@/shared/api/request-helpers';

const downloadClient = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env),
  timeout: 60000,
  responseType: 'blob',
  withCredentials: true
});

export function parseDownloadFileName(contentDisposition, fallback) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}

export async function normalizeDownloadError(
  error,
  storage = localStorage,
  location = typeof window !== 'undefined' ? window.location : null
) {
  if (error?.response?.data instanceof Blob) {
    try {
      const rawText = await error.response.data.text();
      if (rawText) {
        error.response.data = JSON.parse(rawText);
      }
    } catch {
      // Fall back to the default request error normalization below.
    }
  }

  return normalizeRequestError(error, storage, location);
}

export async function requestTaskReportDownload(taskId, format = 'docx', config = {}) {
  try {
    const response = await downloadClient.get(`/tasks/${taskId}/download`, {
      ...config,
      params: {
        ...(config.params || {}),
        format
      }
    });

    return {
      blob: response.data,
      fileName: parseDownloadFileName(
        response.headers['content-disposition'],
        `研究报告-${taskId}.${format}`
      )
    };
  } catch (error) {
    throw await normalizeDownloadError(error);
  }
}
