import request from '@/shared/api/request';

// ── Template CRUD ─────────────────────────────────────────

export const createTemplate = (data, config = {}) =>
  request.post('/api/templates', data, config);

export const getTemplates = (params = {}, config = {}) =>
  request.get('/api/templates', { params, ...config });

export const getTemplate = (id, config = {}) =>
  request.get(`/api/templates/${id}`, config);

export const updateTemplate = (id, data, config = {}) =>
  request.put(`/api/templates/${id}`, data, config);

export const deleteTemplate = (id, config = {}) =>
  request.delete(`/api/templates/${id}`, config);

// ── Review Workflow ───────────────────────────────────────

export const submitTemplateReview = (id, config = {}) =>
  request.post(`/api/templates/${id}/submit-review`, null, config);

export const approveTemplate = (id, data = {}, config = {}) =>
  request.post(`/api/templates/${id}/approve`, data, config);

export const rejectTemplate = (id, data = {}, config = {}) =>
  request.post(`/api/templates/${id}/reject`, data, config);
