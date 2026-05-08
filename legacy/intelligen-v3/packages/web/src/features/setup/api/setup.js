import request from '@/shared/api/request';

export const getSetupStatus = () => request.get('/setup/status');

export const initializeSystem = (data) => request.post('/setup/init', data);

export const setupLlm = (data) => request.post('/setup/llm', data);

export const testLlmConnection = (data) => request.post('/setup/llm/test', data);

export const setupStorage = (data) => request.post('/setup/storage', data);

export const testStorageConnection = (data) => request.post('/setup/storage/test', data);

export const completeSetup = () => request.post('/setup/complete');
