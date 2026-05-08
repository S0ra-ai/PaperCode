import request from '@/shared/api/request';

export const uploadFile = (file, config = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/files/upload', formData, {
    ...config,
    headers: {
      ...(config.headers || {}),
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const getFiles = () => request.get('/files');

export const getFileDetail = (fileId) => request.get(`/files/${fileId}`);

export const deleteFile = (fileId) => request.delete(`/files/${fileId}`);
