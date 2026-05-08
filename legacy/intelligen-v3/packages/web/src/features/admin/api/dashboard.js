import request from '@/shared/api/request';

// Dashboard
export const getDashboard = (config = {}) =>
  request.get('/admin/dashboard', config);

// Real-time metrics
export const getRealtimeMetrics = (config = {}) =>
  request.get('/admin/metrics/realtime', config);

// Usage stats over N days
export const getUsageStats = (params = { days: 7 }, config = {}) =>
  request.get('/admin/metrics/usage', { ...config, params });

// Model management
export const getModels = (config = {}) =>
  request.get('/admin/models', config);

export const updateModelConfig = (modelId, data, config = {}) =>
  request.put(`/admin/models/${modelId}`, data, config);

// System health
export const getSystemHealth = (config = {}) =>
  request.get('/admin/system/health', config);

// User management
export const getUsers = (params, config = {}) =>
  request.get('/admin/users', { ...config, params });

export const updateUserRole = (userId, role, config = {}) =>
  request.put(`/admin/users/${userId}/role`, null, { ...config, params: { role } });
