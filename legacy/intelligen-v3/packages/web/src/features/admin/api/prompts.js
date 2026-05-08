import request from '@/shared/api/request'

/** 列出所有提示词阶段 */
export const listPrompts = () => request.get('/admin/prompts')

/** 获取单个阶段提示词 */
export const getPrompt = (stage) => request.get(`/admin/prompts/${stage}`)

/** 更新提示词内容 */
export const updatePrompt = (stage, data) => request.put(`/admin/prompts/${stage}`, data)

/** 预览渲染后的提示词 */
export const previewPrompt = (stage, variables) =>
  request.post(`/admin/prompts/${stage}/preview`, variables)
