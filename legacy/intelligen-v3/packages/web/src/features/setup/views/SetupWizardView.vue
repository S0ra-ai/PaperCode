<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getSetupStatus,
  initializeSystem,
  testLlmConnection,
  testStorageConnection,
} from '@/features/setup/api/setup';

const router = useRouter();

const currentStep = ref(0);
const loading = ref(true);
const submitting = ref(false);
const feedback = reactive({ type: '', text: '' });
const setupStatus = ref(null);

// ── Admin form ──
const adminForm = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
});

// ── LLM form ──
const llmForm = reactive({
  provider: 'openrouter',
  api_key: '',
  base_url: 'https://openrouter.ai/api/v1',
  writing_model: 'qwen/qwen3-235b-a22b',
  fast_model: 'qwen/qwen3-30b-a3b',
});
const llmTesting = ref(false);
const llmTestResult = ref(null);

// ── Storage form ──
const storageForm = reactive({
  mode: 'local',
  local_path: './uploads',
  cos_secret_id: '',
  cos_secret_key: '',
  cos_bucket: '',
  cos_region: 'ap-shanghai',
});
const storageTesting = ref(false);
const storageTestResult = ref(null);

// ── Data action ──
const dataAction = ref('keep_all');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminFormError = computed(() => {
  if (!adminForm.username.trim()) return '请输入管理员用户名。';
  if (adminForm.username.trim().length < 2) return '用户名至少需要 2 个字符。';
  if (!adminForm.password) return '请输入密码。';
  if (adminForm.password.length < 6) return '密码至少需要 6 位。';
  if (adminForm.password !== adminForm.confirmPassword) return '两次输入的密码不一致。';
  if (!adminForm.nickname.trim()) return '请输入显示昵称。';
  if (!adminForm.email.trim()) return '请输入邮箱。';
  if (!emailPattern.test(adminForm.email.trim())) return '请输入有效的邮箱地址。';
  return '';
});

const passwordStrength = computed(() => {
  const p = adminForm.password;
  if (!p) return { level: 0, text: '', cls: '' };
  let score = 0;
  if (p.length >= 6) score++;
  if (p.length >= 10) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 2) return { level: 1, text: '弱', cls: 'weak' };
  if (score <= 3) return { level: 2, text: '中', cls: 'medium' };
  return { level: 3, text: '强', cls: 'strong' };
});

const isSubmitDisabled = computed(() => submitting.value || Boolean(adminFormError.value));

const steps = computed(() => {
  const base = [
    { key: 'welcome', label: '系统检测' },
    { key: 'admin', label: '管理员账号' },
    { key: 'llm', label: 'LLM 配置' },
    { key: 'storage', label: '文件存储' },
  ];
  if (setupStatus.value?.hasExistingData) {
    base.push({ key: 'data', label: '数据迁移' });
  }
  base.push({ key: 'done', label: '完成' });
  return base;
});

function setFeedback(type, text) {
  feedback.type = type;
  feedback.text = text;
}

onMounted(async () => {
  try {
    const data = await getSetupStatus();
    setupStatus.value = data;
    if (!data.needsSetup) {
      router.replace('/login');
      return;
    }
    // Pre-fill LLM if already configured
    if (data.hasLlmConfig) {
      llmForm.api_key = '••••••••';
    }
  } catch (e) {
    setFeedback('error', '无法连接后端服务，请确认服务已启动。');
  } finally {
    loading.value = false;
  }
});

function nextStep() {
  const key = steps.value[currentStep.value]?.key;

  if (key === 'admin' && adminFormError.value) {
    setFeedback('error', adminFormError.value);
    return;
  }

  setFeedback('', '');
  llmTestResult.value = null;
  storageTestResult.value = null;

  const nextKey = steps.value[currentStep.value + 1]?.key;

  // If we're on the last step before 'done', submit
  if (nextKey === 'done') {
    handleSubmit();
    return;
  }

  currentStep.value++;
}

function prevStep() {
  setFeedback('', '');
  if (currentStep.value > 0) currentStep.value--;
}

function skipStep() {
  setFeedback('', '');
  currentStep.value++;
}

async function handleTestLlm() {
  llmTesting.value = true;
  llmTestResult.value = null;
  try {
    const result = await testLlmConnection({
      provider: llmForm.provider,
      api_key: llmForm.api_key,
      base_url: llmForm.base_url,
      writing_model: llmForm.writing_model,
      fast_model: llmForm.fast_model,
    });
    llmTestResult.value = result;
  } catch (e) {
    llmTestResult.value = { ok: false, message: e.message || '测试失败' };
  } finally {
    llmTesting.value = false;
  }
}

async function handleTestStorage() {
  storageTesting.value = true;
  storageTestResult.value = null;
  try {
    const result = await testStorageConnection({
      mode: storageForm.mode,
      local_path: storageForm.local_path,
      cos_secret_id: storageForm.cos_secret_id,
      cos_secret_key: storageForm.cos_secret_key,
      cos_bucket: storageForm.cos_bucket,
      cos_region: storageForm.cos_region,
    });
    storageTestResult.value = result;
  } catch (e) {
    storageTestResult.value = { ok: false, message: e.message || '测试失败' };
  } finally {
    storageTesting.value = false;
  }
}

async function handleSubmit() {
  if (adminFormError.value) {
    setFeedback('error', adminFormError.value);
    return;
  }
  submitting.value = true;
  setFeedback('', '');
  try {
    const payload = {
      admin: {
        username: adminForm.username.trim(),
        password: adminForm.password,
        nickname: adminForm.nickname.trim(),
        email: adminForm.email.trim(),
      },
      dataAction: dataAction.value,
    };

    // Include LLM config if API key was entered (not the placeholder)
    if (llmForm.api_key && llmForm.api_key !== '••••••••') {
      payload.llm = {
        provider: llmForm.provider,
        api_key: llmForm.api_key,
        base_url: llmForm.base_url,
        writing_model: llmForm.writing_model,
        fast_model: llmForm.fast_model,
      };
    }

    // Include storage config if not default
    if (storageForm.mode === 'cos' || storageForm.local_path !== './uploads') {
      payload.storage = { ...storageForm };
    }

    await initializeSystem(payload);
    currentStep.value = steps.value.length - 1;
  } catch (e) {
    const msg = e?.payload?.detail || e?.message || '初始化失败，请重试。';
    setFeedback('error', msg);
  } finally {
    submitting.value = false;
  }
}

function goToLogin() {
  window.__setupChecked = false;
  router.push('/login');
}

const modelOptions = [
  { value: 'qwen/qwen3-235b-a22b', label: 'Qwen3-235B-A22B', desc: '大型写作模型，适合深度内容生成' },
  { value: 'qwen/qwen3-30b-a3b', label: 'Qwen3-30B-A3B', desc: '快速模型，适合摘要、关键词等轻量任务' },
  { value: 'qwen/qwen-coder-plus', label: 'Qwen Coder Plus', desc: '代码理解与生成专用' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', desc: '通用高质量推理与写作' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Google 最新多模态模型' },
  { value: 'openai/gpt-4.1', label: 'GPT-4.1', desc: 'OpenAI 旗舰模型' },
];
</script>

<template>
  <div class="setup-layout">
    <div class="layout-overlay"></div>

    <!-- Header -->
    <header class="top-nav">
      <div class="logo">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        IntelliGen
      </div>
      <span class="setup-badge">初始化向导</span>
    </header>

    <!-- Loading state -->
    <div v-if="loading" class="center-content">
      <div class="glass-panel">
        <div class="loading-state">
          <div class="spinner"></div>
          <p>正在检测系统状态…</p>
        </div>
      </div>
    </div>

    <!-- Wizard content -->
    <div v-else class="center-content">
      <div class="glass-panel wizard-panel">

        <!-- Step indicator -->
        <div class="step-indicator">
          <div v-for="(step, idx) in steps" :key="step.key"
            :class="['step-dot', { active: idx === currentStep, done: idx < currentStep }]">
            <span class="dot">
              <svg v-if="idx < currentStep" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <template v-else>{{ idx + 1 }}</template>
            </span>
            <span class="step-label">{{ step.label }}</span>
          </div>
        </div>

        <!-- Feedback -->
        <div v-if="feedback.text" :class="['feedback-bar', feedback.type]">
          {{ feedback.text }}
        </div>

        <!-- ═══════ Step 1: Welcome / System Check ═══════ -->
        <div v-if="steps[currentStep]?.key === 'welcome'" class="step-content" key="welcome">
          <div class="step-header">
            <div class="step-icon welcome-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h2>欢迎使用 IntelliGen</h2>
            <p class="step-desc">AI 驱动的学术报告生成平台。系统检测到这是首次运行，需要完成初始化设置。</p>
          </div>

          <div class="check-list">
            <div class="check-item ok">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>后端服务连接正常</span>
            </div>
            <div class="check-item ok">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>数据库连接正常</span>
            </div>
            <div :class="['check-item', setupStatus?.hasLlmConfig ? 'ok' : 'warn']">
              <svg v-if="!setupStatus?.hasLlmConfig" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{{ setupStatus?.hasLlmConfig ? 'LLM API 已配置' : 'LLM API 尚未配置' }}</span>
            </div>
            <div :class="['check-item', setupStatus?.hasExistingData ? 'warn' : 'ok']">
              <svg v-if="setupStatus?.hasExistingData" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{{ setupStatus?.hasExistingData ? '检测到历史数据' : '数据库为空，全新安装' }}</span>
            </div>
            <div class="check-item info" v-if="setupStatus?.hasExistingData && setupStatus?.dataStats">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>{{ setupStatus.dataStats.users }} 个用户 · {{ setupStatus.dataStats.sessions }} 个会话 · {{ setupStatus.dataStats.tasks }} 个任务</span>
            </div>
          </div>

          <div class="step-actions">
            <button class="btn-primary" @click="nextStep">开始设置</button>
          </div>
        </div>

        <!-- ═══════ Step 2: Admin Account ═══════ -->
        <div v-if="steps[currentStep]?.key === 'admin'" class="step-content" key="admin">
          <div class="step-header">
            <div class="step-icon admin-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h2>创建超级管理员</h2>
            <p class="step-desc">此账号拥有系统最高权限，包括用户审批、日志查看等管理功能。</p>
          </div>

          <form class="form-body" @submit.prevent="nextStep">
            <div class="field-row">
              <div class="field-item field-half">
                <label>用户名</label>
                <input v-model.trim="adminForm.username" type="text" placeholder="admin" autocomplete="username" />
              </div>
              <div class="field-item field-half">
                <label>显示昵称</label>
                <input v-model.trim="adminForm.nickname" type="text" placeholder="系统管理员" />
              </div>
            </div>
            <div class="field-item">
              <label>联系邮箱</label>
              <input v-model.trim="adminForm.email" type="email" placeholder="admin@example.com" />
            </div>
            <div class="field-row">
              <div class="field-item field-half">
                <label>设置密码</label>
                <input v-model="adminForm.password" type="password" placeholder="至少 6 位字符" autocomplete="new-password" />
              </div>
              <div class="field-item field-half">
                <label>确认密码</label>
                <input v-model="adminForm.confirmPassword" type="password" placeholder="再次输入密码" autocomplete="new-password" />
              </div>
            </div>
            <!-- Password strength -->
            <div v-if="adminForm.password" class="password-strength">
              <div class="strength-bar">
                <div :class="['strength-fill', passwordStrength.cls]" :style="{ width: (passwordStrength.level / 3 * 100) + '%' }"></div>
              </div>
              <span :class="['strength-text', passwordStrength.cls]">密码强度: {{ passwordStrength.text }}</span>
            </div>
          </form>

          <div class="step-actions two">
            <button class="btn-ghost" @click="prevStep">返回</button>
            <button class="btn-primary" :disabled="Boolean(adminFormError)" @click="nextStep">下一步</button>
          </div>
        </div>

        <!-- ═══════ Step 3: LLM Configuration ═══════ -->
        <div v-if="steps[currentStep]?.key === 'llm'" class="step-content" key="llm">
          <div class="step-header">
            <div class="step-icon llm-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
                <circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/>
              </svg>
            </div>
            <h2>LLM 模型配置</h2>
            <p class="step-desc">配置大语言模型接口，系统使用 OpenRouter 统一调用各种 AI 模型。</p>
          </div>

          <div class="form-body">
            <div class="field-item">
              <label>API 提供商</label>
              <div class="select-wrapper">
                <select v-model="llmForm.provider">
                  <option value="openrouter">OpenRouter (推荐)</option>
                </select>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            <div class="field-item">
              <label>API Key</label>
              <input v-model="llmForm.api_key" type="password" placeholder="sk-or-v1-..." autocomplete="off" />
              <span class="field-hint">从 <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> 获取</span>
            </div>
            <div class="field-item">
              <label>API 地址</label>
              <input v-model="llmForm.base_url" type="text" placeholder="https://openrouter.ai/api/v1" />
            </div>
            <div class="field-row">
              <div class="field-item field-half">
                <label>写作模型</label>
                <div class="select-wrapper">
                  <select v-model="llmForm.writing_model">
                    <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <span class="field-hint">用于大纲规划、正文撰写</span>
              </div>
              <div class="field-item field-half">
                <label>快速模型</label>
                <div class="select-wrapper">
                  <select v-model="llmForm.fast_model">
                    <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <span class="field-hint">用于关键词、摘要等轻量任务</span>
              </div>
            </div>

            <!-- Test connection -->
            <div class="test-row">
              <button class="btn-outline" :disabled="llmTesting || !llmForm.api_key" @click="handleTestLlm">
                {{ llmTesting ? '测试中...' : '测试连接' }}
              </button>
              <span v-if="llmTestResult" :class="['test-result', llmTestResult.ok ? 'ok' : 'fail']">
                {{ llmTestResult.message }}
              </span>
            </div>
          </div>

          <div class="step-actions two">
            <button class="btn-ghost" @click="prevStep">返回</button>
            <div class="action-right">
              <button class="btn-ghost" @click="skipStep">跳过</button>
              <button class="btn-primary" @click="nextStep">下一步</button>
            </div>
          </div>
        </div>

        <!-- ═══════ Step 4: File Storage ═══════ -->
        <div v-if="steps[currentStep]?.key === 'storage'" class="step-content" key="storage">
          <div class="step-header">
            <div class="step-icon storage-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2>文件存储配置</h2>
            <p class="step-desc">选择文件存储方式。本地存储适合开发测试，COS 适合生产部署。</p>
          </div>

          <div class="form-body">
            <div class="radio-group compact">
              <label :class="['radio-card', { selected: storageForm.mode === 'local' }]">
                <input type="radio" v-model="storageForm.mode" value="local" />
                <div class="radio-body">
                  <span class="radio-title">本地存储</span>
                  <span class="radio-desc">文件保存在服务器本地磁盘</span>
                </div>
              </label>
              <label :class="['radio-card', { selected: storageForm.mode === 'cos' }]">
                <input type="radio" v-model="storageForm.mode" value="cos" />
                <div class="radio-body">
                  <span class="radio-title">腾讯云 COS</span>
                  <span class="radio-desc">对象存储，高可用、大容量</span>
                </div>
              </label>
            </div>

            <!-- Local config -->
            <div v-if="storageForm.mode === 'local'" class="field-item">
              <label>存储路径</label>
              <input v-model="storageForm.local_path" type="text" placeholder="./uploads" />
              <span class="field-hint">相对于后端根目录的路径</span>
            </div>

            <!-- COS config -->
            <template v-if="storageForm.mode === 'cos'">
              <div class="field-row">
                <div class="field-item field-half">
                  <label>SecretId</label>
                  <input v-model="storageForm.cos_secret_id" type="password" placeholder="AKID..." autocomplete="off" />
                </div>
                <div class="field-item field-half">
                  <label>SecretKey</label>
                  <input v-model="storageForm.cos_secret_key" type="password" placeholder="••••••••" autocomplete="off" />
                </div>
              </div>
              <div class="field-row">
                <div class="field-item field-half">
                  <label>Bucket</label>
                  <input v-model="storageForm.cos_bucket" type="text" placeholder="bucket-appid" />
                </div>
                <div class="field-item field-half">
                  <label>Region</label>
                  <div class="select-wrapper">
                    <select v-model="storageForm.cos_region">
                      <option value="ap-shanghai">上海 (ap-shanghai)</option>
                      <option value="ap-beijing">北京 (ap-beijing)</option>
                      <option value="ap-guangzhou">广州 (ap-guangzhou)</option>
                      <option value="ap-chengdu">成都 (ap-chengdu)</option>
                      <option value="ap-hongkong">香港 (ap-hongkong)</option>
                      <option value="ap-singapore">新加坡 (ap-singapore)</option>
                    </select>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              </div>

              <div class="test-row">
                <button class="btn-outline" :disabled="storageTesting || !storageForm.cos_bucket" @click="handleTestStorage">
                  {{ storageTesting ? '测试中...' : '测试连接' }}
                </button>
                <span v-if="storageTestResult" :class="['test-result', storageTestResult.ok ? 'ok' : 'fail']">
                  {{ storageTestResult.message }}
                </span>
              </div>
            </template>
          </div>

          <div class="step-actions two">
            <button class="btn-ghost" @click="prevStep">返回</button>
            <div class="action-right">
              <button class="btn-ghost" @click="skipStep">跳过</button>
              <button class="btn-primary" @click="nextStep">
                {{ steps[currentStep + 1]?.key === 'done' ? '完成设置' : '下一步' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ═══════ Step 5: Data Migration (conditional) ═══════ -->
        <div v-if="steps[currentStep]?.key === 'data'" class="step-content" key="data">
          <div class="step-header">
            <div class="step-icon data-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <h2>历史数据处理</h2>
            <p class="step-desc">检测到数据库中存在历史数据，请选择处理方式：</p>
          </div>

          <div class="data-stats" v-if="setupStatus?.dataStats">
            <div class="stat-card">
              <span class="stat-val">{{ setupStatus.dataStats.users }}</span>
              <span class="stat-lbl">用户</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">{{ setupStatus.dataStats.sessions }}</span>
              <span class="stat-lbl">会话</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">{{ setupStatus.dataStats.tasks }}</span>
              <span class="stat-lbl">任务</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">{{ setupStatus.dataStats.files }}</span>
              <span class="stat-lbl">文件</span>
            </div>
          </div>

          <div class="radio-group">
            <label :class="['radio-card', { selected: dataAction === 'keep_all' }]">
              <input type="radio" v-model="dataAction" value="keep_all" />
              <div class="radio-body">
                <span class="radio-title">保留全部数据</span>
                <span class="radio-desc">保留所有用户、会话和任务，仅新增管理员账号。适合接管已有系统。</span>
              </div>
              <span class="radio-tag safe">推荐</span>
            </label>
            <label :class="['radio-card', { selected: dataAction === 'keep_users' }]">
              <input type="radio" v-model="dataAction" value="keep_users" />
              <div class="radio-body">
                <span class="radio-title">保留用户，清空任务</span>
                <span class="radio-desc">保留用户账号信息，清空所有会话、任务和上传文件。</span>
              </div>
              <span class="radio-tag caution">部分重置</span>
            </label>
            <label :class="['radio-card', { selected: dataAction === 'full_reset' }]">
              <input type="radio" v-model="dataAction" value="full_reset" />
              <div class="radio-body">
                <span class="radio-title">全部重置</span>
                <span class="radio-desc">清空所有数据，从零开始。此操作不可逆。</span>
              </div>
              <span class="radio-tag danger">危险</span>
            </label>
          </div>

          <div class="step-actions two">
            <button class="btn-ghost" @click="prevStep">返回</button>
            <button class="btn-primary" :disabled="submitting" @click="handleSubmit">
              {{ submitting ? '初始化中...' : '确认并完成' }}
            </button>
          </div>
        </div>

        <!-- ═══════ Step 6: Done ═══════ -->
        <div v-if="steps[currentStep]?.key === 'done'" class="step-content" key="done">
          <div class="step-header">
            <div class="step-icon done-icon">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>初始化完成 🎉</h2>
            <p class="step-desc">系统已就绪，管理员账号已创建。现在可以登录并开始使用。</p>
          </div>

          <div class="done-summary">
            <div class="summary-row">
              <span class="summary-label">管理员</span>
              <span class="summary-value">{{ adminForm.username }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">邮箱</span>
              <span class="summary-value">{{ adminForm.email }}</span>
            </div>
            <div class="summary-row" v-if="llmForm.api_key && llmForm.api_key !== '••••••••'">
              <span class="summary-label">LLM</span>
              <span class="summary-value">{{ llmForm.provider }} · {{ llmForm.writing_model.split('/').pop() }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">存储</span>
              <span class="summary-value">{{ storageForm.mode === 'cos' ? '腾讯云 COS' : '本地存储' }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">数据处理</span>
              <span class="summary-value">{{
                dataAction === 'keep_all' ? '保留全部' :
                dataAction === 'keep_users' ? '保留用户' : '全部重置'
              }}</span>
            </div>
          </div>

          <div class="step-actions">
            <button class="btn-primary" @click="goToLogin">前往登录</button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════ Layout — reuse LoginView dark glassmorphic theme ═══════ */
.setup-layout {
  min-height: 100vh;
  color: #fff;
  font-family: 'Inter', system-ui, sans-serif;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #080F21;
}

.setup-layout::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(168,85,247,0.1), transparent);
  z-index: 0;
}

.layout-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(8,15,33,0.6) 0%, rgba(13,20,48,0.9) 100%);
  z-index: 1;
}

/* ═══════ Header ═══════ */
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

.logo svg { color: #3B82F6; }

.setup-badge {
  background: rgba(59,130,246,0.15);
  border: 1px solid rgba(59,130,246,0.35);
  color: #93C5FD;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* ═══════ Center container ═══════ */
.center-content {
  position: relative;
  z-index: 10;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* ═══════ Glass panel ═══════ */
.glass-panel {
  position: relative;
  width: 100%;
  max-width: 600px;
  background: rgba(14,21,41,0.55);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 30px 60px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 2.5rem 3rem;
  animation: slideFadeIn 0.6s cubic-bezier(0.2,0.8,0.2,1);
}

.wizard-panel { max-width: 680px; }

@keyframes slideFadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══════ Loading ═══════ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem 0;
}

.loading-state p { color: #94A3B8; font-size: 1rem; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ═══════ Step indicator ═══════ */
.step-indicator {
  display: flex;
  justify-content: center;
  gap: 1.2rem;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-wrap: wrap;
}

.step-dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  background: rgba(255,255,255,0.06);
  border: 2px solid rgba(255,255,255,0.15);
  color: #64748B;
  transition: all 0.3s;
}

.step-dot.active .dot {
  background: rgba(59,130,246,0.2);
  border-color: #3B82F6;
  color: #93C5FD;
  box-shadow: 0 0 16px rgba(59,130,246,0.3);
}

.step-dot.done .dot {
  background: rgba(16,185,129,0.2);
  border-color: #10b981;
  color: #6EE7B7;
}

.step-label {
  font-size: 0.7rem;
  color: #64748B;
  font-weight: 600;
  white-space: nowrap;
}

.step-dot.active .step-label { color: #FDE047; }
.step-dot.done .step-label { color: #6EE7B7; }

/* ═══════ Feedback ═══════ */
.feedback-bar {
  padding: 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  border: 1px solid transparent;
}

.feedback-bar.error { background: rgba(239,68,68,0.15); color: #FCA5A5; border-color: rgba(239,68,68,0.3); }
.feedback-bar.success { background: rgba(16,185,129,0.15); color: #6EE7B7; border-color: rgba(16,185,129,0.3); }

/* ═══════ Step content ═══════ */
.step-content {
  animation: fadeUp 0.35s ease-out;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.step-header {
  text-align: center;
  margin-bottom: 2rem;
}

.step-icon {
  width: 64px; height: 64px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.welcome-icon { background: rgba(59,130,246,0.15); color: #60A5FA; border: 1px solid rgba(59,130,246,0.3); }
.admin-icon { background: rgba(234,179,8,0.15); color: #FDE047; border: 1px solid rgba(234,179,8,0.3); }
.llm-icon { background: rgba(139,92,246,0.15); color: #C084FC; border: 1px solid rgba(139,92,246,0.3); }
.storage-icon { background: rgba(14,165,233,0.15); color: #38BDF8; border: 1px solid rgba(14,165,233,0.3); }
.data-icon { background: rgba(168,85,247,0.15); color: #C084FC; border: 1px solid rgba(168,85,247,0.3); }
.done-icon { background: rgba(16,185,129,0.15); color: #6EE7B7; border: 1px solid rgba(16,185,129,0.3); }

.step-header h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.step-desc {
  color: #94A3B8;
  font-size: 0.95rem;
  margin: 0;
  line-height: 1.5;
}

/* ═══════ Check list (step 1) ═══════ */
.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 2rem;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.check-item.ok { background: rgba(16,185,129,0.08); color: #6EE7B7; }
.check-item.warn { background: rgba(234,179,8,0.08); color: #FDE047; }
.check-item.info { background: rgba(59,130,246,0.08); color: #93C5FD; }

/* ═══════ Form ═══════ */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-bottom: 2rem;
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
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.field-item input:hover,
.field-item select:hover {
  background: rgba(0,0,0,0.6);
  border-color: rgba(255,255,255,0.2);
}

.field-item input:focus,
.field-item select:focus {
  outline: none;
  background: rgba(0,0,0,0.7);
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.2);
}

.field-item input::placeholder { color: rgba(255,255,255,0.3); }

.field-hint {
  font-size: 0.78rem;
  color: #64748B;
  line-height: 1.3;
}

.field-hint a {
  color: #60A5FA;
  text-decoration: none;
}

.field-hint a:hover { text-decoration: underline; }

.select-wrapper { position: relative; }
.select-wrapper select { appearance: none; padding-right: 40px; width: 100%; cursor: pointer; }
.select-wrapper svg { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94A3B8; }
.select-wrapper option { background: #0F172B; color: #fff; }

/* ═══════ Password strength ═══════ */
.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s, background-color 0.3s;
}

.strength-fill.weak { background: #EF4444; }
.strength-fill.medium { background: #F59E0B; }
.strength-fill.strong { background: #10B981; }

.strength-text {
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.strength-text.weak { color: #FCA5A5; }
.strength-text.medium { color: #FDE047; }
.strength-text.strong { color: #6EE7B7; }

/* ═══════ Test connection ═══════ */
.test-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.test-result {
  font-size: 0.85rem;
  font-weight: 600;
}

.test-result.ok { color: #6EE7B7; }
.test-result.fail { color: #FCA5A5; }

/* ═══════ Data stats ═══════ */
.data-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  flex: 1;
  text-align: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 14px 8px;
}

.stat-val {
  display: block;
  font-size: 1.5rem;
  font-weight: 800;
  color: #F8FAFC;
}

.stat-lbl {
  font-size: 0.75rem;
  color: #64748B;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ═══════ Radio group ═══════ */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 2rem;
}

.radio-group.compact { margin-bottom: 1.2rem; }

.radio-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: all 0.2s;
}

.radio-card:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.15);
}

.radio-card.selected {
  border-color: rgba(234,179,8,0.5);
  background: rgba(234,179,8,0.06);
}

.radio-card input[type="radio"] {
  margin-top: 3px;
  accent-color: #3B82F6;
  flex-shrink: 0;
}

.radio-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.radio-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #E2E8F0;
}

.radio-desc {
  font-size: 0.82rem;
  color: #94A3B8;
  line-height: 1.4;
}

.radio-tag {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  flex-shrink: 0;
}

.radio-tag.safe { background: rgba(16,185,129,0.15); color: #6EE7B7; }
.radio-tag.caution { background: rgba(234,179,8,0.15); color: #FDE047; }
.radio-tag.danger { background: rgba(239,68,68,0.15); color: #FCA5A5; }

/* ═══════ Done summary ═══════ */
.done-summary {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 2rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.summary-row + .summary-row {
  border-top: 1px solid rgba(255,255,255,0.06);
}

.summary-label { color: #94A3B8; font-size: 0.9rem; }
.summary-value { color: #F8FAFC; font-size: 0.9rem; font-weight: 600; }

/* ═══════ Buttons ═══════ */
.step-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.step-actions.two { justify-content: space-between; }

.action-right {
  display: flex;
  gap: 0.75rem;
}

.btn-primary {
  background: #3B82F6;
  color: #FFFFFF;
  border: none;
  padding: 14px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2,0.8,0.2,1);
  box-shadow: 0 4px 6px -1px rgba(59,130,246,0.2);
}

.btn-primary:hover:not(:disabled) {
  background: #60A5FA;
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -5px rgba(59,130,246,0.5);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.btn-ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  color: #CBD5E1;
  padding: 14px 28px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ghost:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.3);
}

.btn-outline {
  background: transparent;
  border: 1px solid rgba(139,92,246,0.4);
  color: #C084FC;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline:hover:not(:disabled) {
  background: rgba(139,92,246,0.1);
  border-color: rgba(139,92,246,0.6);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ═══════ Responsive ═══════ */
@media (max-width: 640px) {
  .glass-panel { padding: 2rem 1.5rem; }
  .step-indicator { gap: 0.7rem; }
  .step-label { display: none; }
  .field-row { flex-direction: column; }
  .data-stats { flex-wrap: wrap; }
  .stat-card { min-width: calc(50% - 0.5rem); }
  .top-nav { padding: 1.5rem 2rem; }
  .action-right { flex-direction: column; }
}
</style>
