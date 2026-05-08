import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeRequestError,
  resolveApiBaseUrl,
  unwrapApiResponse
} from '@/shared/api/request-helpers';

describe('request-helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns payload for documented success codes', () => {
    expect(unwrapApiResponse({ data: { code: 200, data: { ok: true } } })).toEqual({
      code: 200,
      data: { ok: true }
    });
    expect(unwrapApiResponse({ data: { code: 202, data: { status: 'processing' } } })).toEqual({
      code: 202,
      data: { status: 'processing' }
    });
  });

  it('prefers explicit api base url from environment', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://api.example.com' })).toBe('https://api.example.com');
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: '   /backend   ' })).toBe('/backend');
  });

  it('falls back to the nginx reverse proxy prefix in production builds', () => {
    expect(resolveApiBaseUrl({ PROD: true })).toBe('/backend');
  });

  it('falls back to the local backend during development', () => {
    expect(resolveApiBaseUrl({ DEV: true }, { hostname: '127.0.0.1' })).toBe('http://127.0.0.1:9992');
  });

  it('throws business message for non-success payloads', () => {
    expect(() => unwrapApiResponse({ data: { code: 400, message: '请求参数错误', data: { field: 'name' } } }))
      .toThrow('请求参数错误');

    try {
      unwrapApiResponse({ data: { code: 500, message: '任务生成失败', data: { taskId: 't-1' } } });
    } catch (error) {
      expect(error.code).toBe(500);
      expect(error.data).toEqual({ taskId: 't-1' });
    }
  });

  it('clears session and redirects on 401 errors', () => {
    const storage = {
      removeItem: vi.fn()
    };
    const location = {
      pathname: '/app',
      href: '/app'
    };

    const normalizedError = normalizeRequestError(
      {
        response: {
          status: 401,
          data: { message: '未登录或登录已过期' }
        }
      },
      storage,
      location
    );

    expect(normalizedError.message).toBe('未登录或登录已过期');
    expect(storage.removeItem).toHaveBeenCalledWith('userInfo');
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(location.href).toBe('/login');
  });

  it('preserves backend payload when normalizing request errors', () => {
    const normalizedError = normalizeRequestError({
      response: {
        status: 500,
        data: {
          code: 500,
          message: '模型服务未配置',
          data: {
            taskId: 'task-1',
            status: 'failed'
          }
        }
      }
    });

    expect(normalizedError.message).toBe('模型服务未配置');
    expect(normalizedError.code).toBe(500);
    expect(normalizedError.data).toEqual({
      taskId: 'task-1',
      status: 'failed'
    });
  });

  it('unwrapApiResponse supports msg field for safety block responses', () => {
    try {
      unwrapApiResponse({
        data: {
          code: 403,
          msg: '检测到4个严重敏感词，且包含生成请求，已阻止',
          data: {
            risk_level: 'critical',
            action: 'block',
            detected_keywords: ['毒', '毒品', '制造毒品', '制造'],
            categories: ['毒品词库', '零时-Tencent', 'GFW补充词库']
          }
        }
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error.message).toBe('检测到4个严重敏感词，且包含生成请求，已阻止');
      expect(error.code).toBe(403);
      expect(error.data.action).toBe('block');
      expect(error.data.risk_level).toBe('critical');
      expect(error.data.detected_keywords).toEqual(['毒', '毒品', '制造毒品', '制造']);
      expect(error.data.categories).toEqual(['毒品词库', '零时-Tencent', 'GFW补充词库']);
    }
  });

  it('normalizeRequestError supports msg field and preserves safety block data', () => {
    const normalizedError = normalizeRequestError({
      response: {
        status: 403,
        data: {
          code: 403,
          msg: '检测到敏感词，已阻止',
          data: {
            risk_level: 'critical',
            action: 'block',
            detected_keywords: ['违禁词A'],
            categories: ['测试词库']
          }
        }
      }
    });

    expect(normalizedError.message).toBe('检测到敏感词，已阻止');
    expect(normalizedError.code).toBe(403);
    expect(normalizedError.data).toEqual({
      risk_level: 'critical',
      action: 'block',
      detected_keywords: ['违禁词A'],
      categories: ['测试词库']
    });
  });

  it('unwrapApiResponse prefers message over msg when both exist', () => {
    try {
      unwrapApiResponse({
        data: {
          code: 403,
          message: '优先消息',
          msg: '备用消息',
          data: null
        }
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error.message).toBe('优先消息');
    }
  });
});
