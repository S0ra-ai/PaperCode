import request from '@/shared/api/request';

export const getPendingUsers = (params, config = {}) => request.get('/admin/users/pending', { ...config, params });

export const auditUser = (userId, data, config = {}) => request.put(`/admin/users/${userId}/audit`, data, config);

export const forceDeleteSessionAsAdmin = (sessionId, config = {}) => request.delete(`/admin/sessions/${sessionId}`, config);

export const getOperationLogs = (params, config = {}) => request.get('/admin/audit-logs', { ...config, params });
