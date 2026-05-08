<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/features/auth/stores/user';
import { logout as apiLogout } from '@/features/auth/api/auth';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

// 深色模式功能已根据用户要求移除

const currentUser = computed(() => userStore.userInfo || {});
const isAdmin = computed(() => currentUser.value?.role === 'admin');
const isWorkspaceRoute = computed(() => route.path.startsWith('/app'));

async function logout() {
  try {
    await apiLogout();
  } catch {
    // Always clear local state even if the API call fails
  }
  userStore.clearSession();
  router.push('/login');
}
</script>

<template>
  <div v-if="isWorkspaceRoute" class="codex-route-shell">
    <slot />
  </div>
  <div v-else class="app-layout top-navbar-layout">
    <header class="global-header">
      <div class="header-left">
        <div class="brand-icon" @click="router.push('/app')">IG</div>
      </div>

      <div class="header-right">
        <nav class="global-nav">
          <button
            class="nav-btn"
            :class="{ active: route.path.startsWith('/app') }"
            @click="router.push('/app')"
            aria-label="工作台"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </span>
            <span class="nav-text">工作台</span>
          </button>

          <button
            class="nav-btn"
            :class="{ active: route.path.startsWith('/tasks') }"
            @click="router.push('/tasks')"
            aria-label="任务中心"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                <path d="M9 14l2 2 4-4"></path>
              </svg>
            </span>
            <span class="nav-text">任务中心</span>
          </button>

          <button
            class="nav-btn"
            :class="{ active: route.path.startsWith('/templates') }"
            @click="router.push('/templates')"
            aria-label="模板管理"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </span>
            <span class="nav-text">模板管理</span>
          </button>

          <button
            class="nav-btn"
            :class="{ active: route.path === '/profile' }"
            @click="router.push('/profile')"
            aria-label="个人中心"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <span class="nav-text">个人中心</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path === '/admin' }"
            @click="router.push('/admin')"
            aria-label="仪表盘"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
            </span>
            <span class="nav-text">仪表盘</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path.startsWith('/admin/audit') }"
            @click="router.push('/admin/audit')"
            aria-label="审核台"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </span>
            <span class="nav-text">审核台</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path.startsWith('/admin/operation-logs') }"
            @click="router.push('/admin/operation-logs')"
            aria-label="操作日志"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 6h13"></path>
                <path d="M8 12h13"></path>
                <path d="M8 18h13"></path>
                <path d="M3 6h.01"></path>
                <path d="M3 12h.01"></path>
                <path d="M3 18h.01"></path>
              </svg>
            </span>
            <span class="nav-text">操作日志</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path === '/admin/models' }"
            @click="router.push('/admin/models')"
            aria-label="模型配置"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
              </svg>
            </span>
            <span class="nav-text">模型配置</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path === '/admin/providers' }"
            @click="router.push('/admin/providers')"
            aria-label="Provider管理"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </span>
            <span class="nav-text">Provider管理</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path === '/admin/prompts' }"
            @click="router.push('/admin/prompts')"
            aria-label="提示词管理"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </span>
            <span class="nav-text">提示词管理</span>
          </button>

          <button
            v-if="isAdmin"
            class="nav-btn"
            :class="{ active: route.path === '/admin/users' }"
            @click="router.push('/admin/users')"
            aria-label="用户管理"
          >
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
            <span class="nav-text">用户管理</span>
          </button>
        </nav>

        <div class="divider"></div>



        <button class="nav-btn icon-only" @click="logout" aria-label="退出登录" title="退出登录">
          <span class="icon">
            <svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor"><path d="M783.3 543H366.4c-17.1 0-31-13.9-31-31s13.9-31 31-31h416.9l-117.8-117.8c-12.1-12.1-12.1-31.8 0-43.9s31.8-12.1 43.9 0l168.9 168.9c12.1 12.1 12.1 31.8 0 43.9L709.4 701c-6.1 6.1-14 9.1-21.9 9.1s-15.9-3.1-21.9-9.1c-12.1-12.1-12.1-31.8 0-43.9L783.3 543z M294 912H183.4c-42.5 0-77-34.5-77-77V189c0-42.5 34.5-77 77-77H294c17.1 0 31 13.9 31 31s-13.9 31-31 31H183.4c-8.3 0-15 6.7-15 15v646c0 8.3 6.7 15 15 15H294c17.1 0 31 13.9 31 31s-13.9 31-31 31z"></path></svg>
          </span>
        </button>
      </div>
    </header>
    <main class="global-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.codex-route-shell {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background:
    radial-gradient(circle at 15% 10%, rgba(56, 189, 248, 0.10), transparent 30%),
    radial-gradient(circle at 90% 20%, rgba(129, 140, 248, 0.12), transparent 34%),
    #07080d;
}

.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: transparent;
  overflow: hidden;
  position: relative;
}

.global-header {
  height: 64px;
  width: 100%;
  background: var(--surface);
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 100;
  backdrop-filter: blur(24px);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--primary-strong);
  color: var(--btn-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 16px;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: opacity 0.2s ease;
  margin-bottom: 0;
}

.brand-icon:hover {
  opacity: 0.9;
}

.global-nav {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: center;
}

.nav-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.nav-btn:hover,
.nav-btn.active {
  background: var(--surface-strong);
  color: var(--text-main);
  border-color: var(--border-soft);
}

.nav-btn.icon-only {
  width: 40px;
  padding: 0;
  justify-content: center;
}

.divider {
  width: 1px;
  height: 28px;
  background: var(--border-soft);
}

.global-main {
  flex: 1;
  min-height: 0;
  padding: 20px;
  overflow: auto;
}

@media (max-width: 900px) {
  .global-header {
    padding: 0 16px;
  }

  .header-right {
    gap: 12px;
  }

  .nav-text {
    display: none;
  }

  .nav-btn {
    width: 40px;
    padding: 0;
    justify-content: center;
  }

  .divider {
    display: none;
  }
}
</style>
