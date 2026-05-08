import { createRouter, createWebHistory } from 'vue-router';
import { readStoredUserInfo, resolveNavigationTarget, checkSetupNeeded } from '@/app/router/guards';

const LandingView = () => import('@/features/auth/views/LandingView.vue');
const LoginView = () => import('@/features/auth/views/LoginView.vue');
const SetupWizardView = () => import('@/features/setup/views/SetupWizardView.vue');
const WorkspaceView = () => import('@/features/workspace/views/WorkspaceView.vue');
const AdminAuditView = () => import('@/features/admin/views/AdminAuditView.vue');
const AdminOperationLogView = () => import('@/features/admin/views/AdminOperationLogView.vue');
const AdminDashboardView = () => import('@/features/admin/views/AdminDashboardView.vue');
const ModelConfigView = () => import('@/features/admin/views/ModelConfigView.vue');
const UserManagementView = () => import('@/features/admin/views/UserManagementView.vue');
const ProviderManageView = () => import('@/features/admin/views/ProviderManageView.vue');
const PromptManageView = () => import('@/features/admin/views/PromptManageView.vue');
const TemplateManagerView = () => import('@/features/templates/views/TemplateManager.vue');
const TaskCenterView = () => import('@/features/tasks/views/TaskCenterView.vue');
const ProfileView = () => import('@/features/profile/views/ProfileView.vue');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView,
      meta: { public: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true }
    },
    {
      path: '/setup',
      name: 'setup',
      component: SetupWizardView,
      meta: { public: true }
    },
    {
      path: '/app',
      name: 'workspace',
      component: WorkspaceView
    },
    {
      path: '/templates',
      name: 'templates',
      component: TemplateManagerView
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: TaskCenterView
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: AdminDashboardView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/audit',
      name: 'admin-audit',
      component: AdminAuditView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/operation-logs',
      name: 'admin-operation-logs',
      component: AdminOperationLogView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/models',
      name: 'admin-models',
      component: ModelConfigView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: UserManagementView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/providers',
      name: 'admin-providers',
      component: ProviderManageView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/prompts',
      name: 'admin-prompts',
      component: PromptManageView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/shared/views/NotFoundView.vue')
    }
  ]
});

router.beforeEach(async (to) => {
  // One-time setup check: redirect to /setup if no admin exists
  if (to.name !== 'setup') {
    const needsSetup = await checkSetupNeeded();
    if (needsSetup) return { name: 'setup' };
  }

  const rawUser = localStorage.getItem('userInfo');
  const userInfo = readStoredUserInfo(rawUser);

  return resolveNavigationTarget({ to, isLoggedIn: Boolean(userInfo), userInfo });
});

export default router;
