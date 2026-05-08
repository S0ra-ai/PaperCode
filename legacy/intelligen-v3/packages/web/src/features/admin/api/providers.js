import request from '@/shared/api/request'

// Provider CRUD
export const listProviders = (config = {}) =>
  request.get('/admin/providers', config)

export const createProvider = (data, config = {}) =>
  request.post('/admin/providers', data, config)

export const updateProvider = (id, data, config = {}) =>
  request.put(`/admin/providers/${id}`, data, config)

export const deleteProvider = (id, config = {}) =>
  request.delete(`/admin/providers/${id}`, config)

export const testProvider = (id, config = {}) =>
  request.post(`/admin/providers/${id}/test`, null, config)

// AI 辅助自动配置
export const probeModels = (data, config = {}) =>
  request.post('/admin/providers/probe-models', data, config)

export const autoConfigureStages = (id, decisionModel, config = {}) =>
  request.post(`/admin/providers/${id}/auto-configure-stages`, { decision_model: decisionModel }, config)

// Stage 配置
export const getStageConfigs = (config = {}) =>
  request.get('/admin/providers/stages', config)

export const updateStageConfigs = (data, config = {}) =>
  request.put('/admin/providers/stages', data, config)
