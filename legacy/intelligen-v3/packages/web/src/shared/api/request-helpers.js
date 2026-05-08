const SUCCESS_CODES = new Set([200, 202]);

let _isRedirectingToLogin = false;

function createBusinessError(message, payload = {}) {
  const normalizedError = new Error(message || '请求失败');
  normalizedError.code = payload.code;
  normalizedError.data = payload.data;
  normalizedError.payload = payload;
  return normalizedError;
}

export function unwrapApiResponse(response) {
  const payload = response.data;
  if (payload && typeof payload.code !== 'undefined') {
    if (SUCCESS_CODES.has(payload.code)) {
      return payload;
    }
    throw createBusinessError(payload.message || payload.msg || '请求失败', payload);
  }
  return response.data;
}

export function resolveApiBaseUrl(
  env = {},
  _location = typeof window !== 'undefined' ? window.location : null
) {
  const configuredBaseUrl = typeof env.VITE_API_BASE_URL === 'string'
    ? env.VITE_API_BASE_URL.trim()
    : '';

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (env.PROD) {
    return '/backend';
  }

  // Use same hostname as browser to keep httpOnly cookies on the same domain
  const hostname = _location?.hostname || 'localhost';
  return `http://${hostname}:9992`;
}

export function normalizeRequestError(
  error,
  storage = localStorage,
  location = typeof window !== 'undefined' ? window.location : null
) {
  const status = error.response?.status;
  const responseData = error.response?.data;

  if (!error.response) {
    const message = error.code === 'ECONNABORTED' ? '请求超时' : '网络连接失败';
    return createBusinessError(message, { code: 0 });
  }

  if (status === 401) {
    storage.removeItem('userInfo');
    if (location && location.pathname !== '/login' && !_isRedirectingToLogin) {
      _isRedirectingToLogin = true;
      location.href = '/login';
    }
    const message = responseData?.message || responseData?.msg || '登录已过期，请重新登录';
    return createBusinessError(message, {
      code: responseData?.code ?? 401,
      data: responseData?.data,
      ...responseData
    });
  }

  if (status === 403) {
    const message = responseData?.message || responseData?.msg || '权限不足';
    return createBusinessError(message, {
      code: responseData?.code ?? 403,
      data: responseData?.data,
      ...responseData
    });
  }

  if (status >= 500) {
    const message = responseData?.message || responseData?.msg || '服务器错误';
    return createBusinessError(message, {
      code: responseData?.code ?? status,
      data: responseData?.data,
      ...responseData
    });
  }

  const message = responseData?.message || responseData?.msg || error.message || '网络请求失败';
  return createBusinessError(message, {
    code: responseData?.code ?? status,
    data: responseData?.data,
    ...responseData
  });
}
