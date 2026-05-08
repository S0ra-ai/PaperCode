import { describe, expect, it, vi } from 'vitest';
import { readStoredUserInfo, resolveNavigationTarget } from '@/app/router/guards';

describe('router guards', () => {
  it('returns parsed user info when localStorage content is valid', () => {
    expect(readStoredUserInfo('{"role":"admin","username":"alice"}')).toEqual({
      role: 'admin',
      username: 'alice'
    });
  });

  it('clears corrupted localStorage user info and returns null', () => {
    const storage = {
      removeItem: vi.fn()
    };

    expect(readStoredUserInfo('{broken-json', storage)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('userInfo');
  });

  it('redirects authenticated admin from login page to admin dashboard', () => {
    expect(resolveNavigationTarget({
      to: { path: '/login', meta: { public: true } },
      isLoggedIn: true,
      userInfo: { role: 'admin' }
    })).toBe('/admin');
  });

  it('redirects unauthenticated access to private pages back to login', () => {
    expect(resolveNavigationTarget({
      to: { path: '/app', meta: {} },
      isLoggedIn: false,
      userInfo: null
    })).toBe('/login');
  });

  it('blocks non-admin users from admin-only pages', () => {
    expect(resolveNavigationTarget({
      to: { path: '/admin/audit', meta: { requiresAdmin: true } },
      isLoggedIn: true,
      userInfo: { role: 'user' }
    })).toBe('/app');
  });
});
