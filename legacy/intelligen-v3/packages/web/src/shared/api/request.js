import axios from 'axios';
import {
  normalizeRequestError,
  resolveApiBaseUrl,
  unwrapApiResponse
} from '@/shared/api/request-helpers';

const request = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env),
  timeout: 30000,
  withCredentials: true
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

function isRetryableError(error) {
  if (!error.response) return true; // Network error
  const status = error.response.status;
  return status === 429 || (status >= 502 && status <= 504);
}

// Retry interceptor (must run before normalization)
request.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    config.__retryCount = config.__retryCount || 0;

    if (config.__retryCount >= MAX_RETRIES || !isRetryableError(error)) {
      return Promise.reject(error);
    }

    config.__retryCount += 1;
    const delay = RETRY_DELAY_BASE * Math.pow(2, config.__retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
    return request(config);
  }
);

// Response normalization interceptor (runs after retry)
request.interceptors.response.use(
  (response) => unwrapApiResponse(response),
  (error) => Promise.reject(normalizeRequestError(error))
);

export function mergeRequestConfig(baseConfig = {}, extraConfig = {}) {
  return {
    ...baseConfig,
    ...extraConfig,
    headers: {
      ...(baseConfig.headers || {}),
      ...(extraConfig.headers || {})
    }
  };
}

export default request;
