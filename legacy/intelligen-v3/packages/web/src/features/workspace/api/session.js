import request from '@/shared/api/request';

export const createSession = (data, config = {}) => request.post('/sessions', data, config);

export const getSessions = (config = {}) => request.get('/sessions', config);

export const getSessionDetail = (sessionId, config = {}) => request.get(`/sessions/${sessionId}`, config);

export const getSessionWorkspace = (sessionId, config = {}) => request.get(`/sessions/${sessionId}/workspace`, config);

export const getSessionAttachments = (sessionId, config = {}) => request.get(`/sessions/${sessionId}/attachments`, config);

export const uploadSessionAttachment = (sessionId, file, config = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post(`/sessions/${sessionId}/attachments`, formData, {
    ...config,
    headers: {
      ...(config.headers || {}),
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const deleteSession = (sessionId, config = {}) => request.delete(`/sessions/${sessionId}`, config);

export const updateSession = (sessionId, data, config = {}) => request.patch(`/sessions/${sessionId}`, data, config);
