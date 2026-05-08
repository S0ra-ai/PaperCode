<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { login, register } from '@/features/auth/api/auth';
import { useUserStore } from '@/features/auth/stores/user';

const router = useRouter();
const userStore = useUserStore();

const activeTab = ref('login');
const loading = ref(false);
const feedback = reactive({ type: '', text: '' });

const loginForm = reactive({ username: '', password: '' });

const registerForm = reactive({
  username: '', password: '', nickname: '', email: '', role: 'user'
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginFormError = computed(() => {
  if (!loginForm.username.trim()) return '请输入用户名。';
  if (!loginForm.password) return '请输入密码。';
  return '';
});

const registerFormError = computed(() => {
  if (!registerForm.username.trim()) return '请输入用户名。';
  if (!registerForm.password) return '请输入密码。';
  if (registerForm.password.length < 6) return '密码至少需要 6 位。';
  if (!registerForm.nickname.trim()) return '请输入昵称。';
  if (!registerForm.email.trim()) return '请输入邮箱。';
  if (!emailPattern.test(registerForm.email.trim())) return '请输入有效的邮箱地址。';
  return '';
});

const isLoginSubmitDisabled = computed(() => loading.value || Boolean(loginFormError.value));
const isRegisterSubmitDisabled = computed(() => loading.value || Boolean(registerFormError.value));

function setFeedback(type, text) {
  feedback.type = type;
  feedback.text = text;
}

async function handleLogin() {
  if (loginFormError.value) {
    setFeedback('error', loginFormError.value);
    return;
  }
  loading.value = true;
  setFeedback('', '');
  try {
    const response = await login(loginForm);
    userStore.setSession(response.data);
    setFeedback('success', '登录成功，正在进入工作台。');
    router.push(response.data.role === 'admin' ? '/admin/audit' : '/app');
  } catch (error) {
    setFeedback('error', error.message || '登录失败，请检查用户名和密码');
  } finally {
    loading.value = false;
  }
}

async function handleRegister() {
  if (registerFormError.value) {
    setFeedback('error', registerFormError.value);
    return;
  }
  loading.value = true;
  setFeedback('', '');
  try {
    await register(registerForm);
    setFeedback('success', '注册成功，请等待管理员审核后再登录。');
    activeTab.value = 'login';
  } catch (error) {
    setFeedback('error', error.message || '注册失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

function handleBackToHome() {
  router.push('/');
}
</script>

<template>
  <div class="login-layout">
    <!-- 核心视觉遮罩层：提供那种律师网站般极度深邃和权威的蓝黑色沉浸底纹 -->
    <div class="layout-overlay"></div>
    
    <!-- 顶部导航 -->
    <header class="top-nav">
      <div class="logo">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        IntelliGen
      </div>
      <button class="back-btn" @click="handleBackToHome">返回主站 &rarr;</button>
    </header>

    <div class="content-wrapper">
      
      <!-- 左侧：愿景墙 (Hero) -->
      <aside class="hero-section">
        <div class="hero-content">
          <span class="badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            IntelliGen Platform
          </span>
          <h1 class="hero-title">洞悉数据<br/>赋能研究</h1>
          <p class="hero-subtitle">
            融合前沿大模型与深度数据分析算法，只需一键导入，为您在海量文献中寻觅灵感，构建专属的立体概念网络图谱。
          </p>
          
          <div class="hero-metrics">
            <div class="metric">
              <span class="metric-icon">
                <!-- 堆叠层级数据图标：匹配“万篇PDF文献”的数据厚度感 -->
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              </span>
              <div>
                <span class="metric-val">万篇+</span>
                <span class="metric-lbl">PDF文献秒级解析</span>
              </div>
            </div>
            <div class="metric">
              <span class="metric-icon">
                <!-- 知识网络节点图标：匹配“课题大盘与图谱关联” -->
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              </span>
              <div>
                <span class="metric-val">全景</span>
                <span class="metric-lbl">课题数据大盘追踪</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：玻璃拟物态表单区 -->
      <main class="form-section">
        <div class="glass-panel">
          <div class="panel-header">
            <h2 class="panel-title">{{ activeTab === 'login' ? '系统登录' : '注册账号' }}</h2>
            <p class="panel-desc">{{ activeTab === 'login' ? '登录工作台，继续您的科研会话。' : '提交请求，分配独立的科研分析沙盒。' }}</p>
          </div>

          <div class="tab-switcher">
            <button :class="['tab-btn', { active: activeTab === 'login' }]" @click="activeTab = 'login'">登录</button>
            <button :class="['tab-btn', { active: activeTab === 'register' }]" @click="activeTab = 'register'">注册</button>
          </div>

          <div v-if="feedback.text" :class="['feedback-bar', feedback.type]">
            {{ feedback.text }}
          </div>

          <!-- 登录表单 -->
          <form v-if="activeTab === 'login'" class="form-body" @submit.prevent="handleLogin">
            <div class="field-item">
              <label>用户名</label>
              <input v-model.trim="loginForm.username" type="text" placeholder="输入已授权账号" />
            </div>
            <div class="field-item">
              <label>密码</label>
              <input v-model="loginForm.password" type="password" placeholder="请输入密码" />
            </div>
            <button class="submit-btn" type="submit" :disabled="isLoginSubmitDisabled">
              {{ loading ? '校验中...' : '进入工作台' }}
            </button>
          </form>

          <!-- 注册表单 -->
          <form v-else class="form-body" @submit.prevent="handleRegister">
            <div class="field-row">
              <div class="field-item field-half">
                <label>设定账号</label>
                <input v-model.trim="registerForm.username" type="text" placeholder="建议使用英文/学号" />
              </div>
              <div class="field-item field-half">
                <label>昵称</label>
                <input v-model.trim="registerForm.nickname" type="text" placeholder="系统显示称呼" />
              </div>
            </div>
            <div class="field-item">
              <label>联系邮箱</label>
              <input v-model.trim="registerForm.email" type="email" placeholder="example@edu.cn" />
            </div>
            <div class="field-item">
              <label>登录密码</label>
              <input v-model="registerForm.password" type="password" placeholder="至少包含 6 位字符" />
            </div>
            <div class="field-item">
              <label>身份角色</label>
              <div class="select-wrapper">
                <select v-model="registerForm.role">
                  <option value="user">普通研究员</option>
                  <option value="student">学生</option>
                  <option value="teacher">教师</option>
                </select>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <button class="submit-btn" type="submit" :disabled="isRegisterSubmitDisabled">
              {{ loading ? '请求发送中...' : '提交注册申请' }}
            </button>
          </form>
        </div>
      </main>

    </div>
  </div>
</template>

<style scoped>
/* 整个页面依托虚幻背景 */
.login-layout {
  min-height: 100vh;
  color: #fff;
  font-family: 'Inter', system-ui, sans-serif;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 承载并水平翻转北京图像，将发光树调至左侧 */
.login-layout::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url('@/assets/images/login-bg.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  transform: scaleX(-1);
  z-index: 0;
}

/* 核心深色渐变图层蒙版 */
.layout-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  /* 调整渐变：左侧透出70%光芒展示树状图谱，右侧加深至95%承托表单 */
  background: linear-gradient(110deg, rgba(8, 15, 33, 0.75) 0%, rgba(13, 20, 48, 0.85) 45%, rgba(15, 23, 42, 0.95) 100%);
  z-index: 1;
}

/* 顶部导航 */
.top-nav {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2rem 4rem;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #F8FAFC;
}

.logo svg {
  color: #3B82F6;
}

.back-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 8px 24px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(8px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateX(-4px);
}

/* 核心两列容器 */
.content-wrapper {
  position: relative;
  z-index: 10;
  flex: 1;
  display: flex;
  align-items: center;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 0 4rem;
  gap: 4rem;
}

/* --- 左侧长明文案区 (Hero) --- */
.hero-section {
  flex: 1.2;
}

.hero-content {
  max-width: 650px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.35);
  color: #FDE047;
  padding: 6px 16px;
  border-radius: 4px; /* 直角边更能体现机构与企业威严感 */
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 2rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-title {
  font-size: 4.5rem;
  line-height: 1.1;
  font-weight: 800;
  margin: 0 0 1.5rem;
  letter-spacing: -0.02em;
  color: #F8FAFC;
  text-shadow: 0 4px 20px rgba(0,0,0,0.6);
}

.hero-subtitle {
  font-size: 1.2rem;
  line-height: 1.7;
  color: #CBD5E1;
  margin-bottom: 3.5rem;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
  max-width: 90%;
}

.hero-metrics {
  display: flex;
  gap: 3.5rem;
}

.metric {
  display: flex;
  align-items: center;
  gap: 14px;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FDE047;
}

.metric div {
  display: flex;
  flex-direction: column;
}

.metric-val {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 4px;
}

.metric-lbl {
  font-size: 0.85rem;
  color: #94A3B8;
  font-weight: 500;
}

/* --- 右侧高级玻璃拟物态表单 --- */
.form-section {
  flex: 0.8;
  display: flex;
  justify-content: flex-end;
  position: relative; /* 为背景修饰元素提供定位基准 */
}

/* 玻璃拟物态渲染内核 */
.glass-panel {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 480px;
  background: rgba(14, 21, 41, 0.55);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 3rem;
  animation: slideFadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slideFadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel-header {
  margin-bottom: 2rem;
}

.panel-title {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.panel-desc {
  font-size: 0.95rem;
  color: #94A3B8;
  margin: 0;
}

.tab-switcher {
  display: flex;
  background: rgba(0, 0, 0, 0.35);
  padding: 4px;
  border-radius: 8px;
  margin-bottom: 2.2rem;
}

.tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: #64748B;
  padding: 10px 0;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.tab-btn:hover { color: #E2E8F0; }
.tab-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  animation: fadeUp 0.3s ease-out;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.field-row { display: flex; gap: 1rem; }
.field-half { flex: 1; }

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item label {
  font-size: 0.85rem;
  color: #CBD5E1;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.field-item input,
.field-item select {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.field-item input:hover,
.field-item select:hover {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.2);
}

.field-item input:focus,
.field-item select:focus {
  outline: none;
  background: rgba(0, 0, 0, 0.7);
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.field-item input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.select-wrapper { position: relative; }
.select-wrapper select { appearance: none; padding-right: 40px; width: 100%; cursor: pointer;}
.select-icon {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: #94A3B8;
}
.select-wrapper option { background: #0F172B; color: #fff; }

/* CTA Button - 蓝色主色调 */
.submit-btn {
  background: #3B82F6;
  color: #FFFFFF;
  border: none;
  padding: 16px;
  border-radius: 8px;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 1rem;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
}

.submit-btn:hover:not(:disabled) {
  background: #60A5FA;
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -5px rgba(59, 130, 246, 0.5);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.feedback-bar {
  padding: 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  border: 1px solid transparent;
}
.feedback-bar.error { background: rgba(239, 68, 68, 0.15); color: #FCA5A5; border-color: rgba(239, 68, 68, 0.3); }
.feedback-bar.success { background: rgba(16, 185, 129, 0.15); color: #6EE7B7; border-color: rgba(16, 185, 129, 0.3); }

/* ========== 响应式降维排版 ========== */
@media (max-width: 1024px) {
  .content-wrapper { flex-direction: column; padding: 2rem; gap: 3rem; }
  .hero-section, .form-section { flex: none; width: 100%; }
  .form-section { justify-content: center; }
  .glass-panel { max-width: 100%; }
  .hero-content { max-width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center;}
  .hero-metrics { justify-content: center; }
  .top-nav { padding: 1.5rem 2rem; }
}

@media (max-width: 640px) {
  .hero-title { font-size: 3rem; }
  .hero-metrics { flex-direction: column; gap: 1.5rem; }
  .glass-panel { padding: 2rem; border-radius: 12px; }
  .content-wrapper { padding: 1rem; margin-top: 1rem; }
  .top-nav { flex-direction: column; gap: 1rem; }
}
</style>
