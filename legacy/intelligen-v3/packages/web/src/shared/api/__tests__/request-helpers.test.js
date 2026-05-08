import { describe, it, expect, vi } from 'vitest'
import {
  unwrapApiResponse,
  resolveApiBaseUrl,
  normalizeRequestError
} from '@/shared/api/request-helpers'

describe('unwrapApiResponse', () => {
  it('returns payload for code 200', () => {
    const response = { data: { code: 200, data: { id: 1 } } }
    expect(unwrapApiResponse(response)).toEqual({ code: 200, data: { id: 1 } })
  })

  it('returns payload for code 202', () => {
    const response = { data: { code: 202, data: null } }
    expect(unwrapApiResponse(response)).toEqual({ code: 202, data: null })
  })

  it('throws business error for non-success code', () => {
    const response = { data: { code: 400, message: '参数错误' } }
    expect(() => unwrapApiResponse(response)).toThrowError('参数错误')
  })

  it('throws with default message when no message in payload', () => {
    const response = { data: { code: 500 } }
    expect(() => unwrapApiResponse(response)).toThrowError('请求失败')
  })

  it('uses msg field as fallback message', () => {
    const response = { data: { code: 403, msg: '禁止访问' } }
    expect(() => unwrapApiResponse(response)).toThrowError('禁止访问')
  })

  it('returns response.data directly when no code field', () => {
    const response = { data: 'plain-text' }
    expect(unwrapApiResponse(response)).toBe('plain-text')
  })

  it('attaches code and data to thrown error', () => {
    const response = { data: { code: 422, message: 'invalid', data: { field: 'name' } } }
    try {
      unwrapApiResponse(response)
    } catch (err) {
      expect(err.code).toBe(422)
      expect(err.data).toEqual({ field: 'name' })
    }
  })
})

describe('resolveApiBaseUrl', () => {
  it('returns VITE_API_BASE_URL when configured', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://api.example.com' })).toBe(
      'https://api.example.com'
    )
  })

  it('trims whitespace from configured URL', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: '  https://api.example.com  ' })).toBe(
      'https://api.example.com'
    )
  })

  it('returns /backend in production when no URL configured', () => {
    expect(resolveApiBaseUrl({ PROD: true })).toBe('/backend')
  })

  it('returns localhost fallback in development', () => {
    expect(resolveApiBaseUrl({}, { hostname: 'localhost' })).toBe('http://localhost:9992')
  })

  it('ignores non-string VITE_API_BASE_URL', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 123 }, { hostname: 'localhost' })).toBe('http://localhost:9992')
  })

  it('treats empty string as unconfigured', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: '   ', PROD: true })).toBe('/backend')
  })
})

describe('normalizeRequestError', () => {
  const mockStorage = {
    removeItem: vi.fn(),
    getItem: vi.fn()
  }

  it('returns timeout error for ECONNABORTED', () => {
    const error = { code: 'ECONNABORTED' }
    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('请求超时')
    expect(result.code).toBe(0)
  })

  it('returns network error when no response', () => {
    const error = {}
    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('网络连接失败')
  })

  it('handles 401 by clearing storage and redirecting', () => {
    const location = { pathname: '/dashboard', href: '' }
    const error = {
      response: { status: 401, data: { message: '未授权' } }
    }

    const result = normalizeRequestError(error, mockStorage, location)

    expect(mockStorage.removeItem).toHaveBeenCalledWith('userInfo')
    expect(mockStorage.removeItem).toHaveBeenCalledTimes(1)
    expect(location.href).toBe('/login')
    expect(result.message).toBe('未授权')
  })

  it('does not redirect if already on /login', () => {
    const location = { pathname: '/login', href: '' }
    const error = {
      response: { status: 401, data: {} }
    }

    normalizeRequestError(error, mockStorage, location)

    expect(location.href).toBe('')
  })

  it('handles 403 forbidden', () => {
    const error = {
      response: { status: 403, data: { message: '权限不足' } }
    }

    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('权限不足')
    expect(result.code).toBe(403)
  })

  it('handles 500+ server errors', () => {
    const error = {
      response: { status: 502, data: { msg: '网关错误' } }
    }

    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('网关错误')
    expect(result.code).toBe(502)
  })

  it('handles other status codes with fallback message', () => {
    const error = {
      response: { status: 422, data: { code: 422, message: '验证失败' } }
    }

    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('验证失败')
    expect(result.code).toBe(422)
  })

  it('uses error.message as last resort fallback', () => {
    const error = {
      message: 'Something went wrong',
      response: { status: 418, data: {} }
    }

    const result = normalizeRequestError(error, mockStorage, null)
    expect(result.message).toBe('Something went wrong')
  })
})
