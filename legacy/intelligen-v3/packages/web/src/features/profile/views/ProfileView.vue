<script setup>
import { onMounted, reactive, ref } from 'vue'
import { getUserInfo, updateProfile, updatePassword } from '@/features/auth/api/auth'
import { useUserStore } from '@/features/auth/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const passwordSaving = ref(false)
const feedback = reactive({ type: '', text: '' })
const activeTab = ref('profile')

// 个人信息表单
const form = reactive({
  nickname: '',
  email: '',
  avatar: '',
  realName: '',
  institution: '',
  department: '',
  studentId: '',
  orcid: '',
  researchArea: ''
})

// 密码修改表单
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

function setFeedback(type, text) {
  feedback.type = type
  feedback.text = text
  if (type === 'success') {
    setTimeout(() => { feedback.text = '' }, 3000)
  }
}

async function loadUserInfo() {
  loading.value = true
  try {
    const data = await getUserInfo()
    Object.assign(form, {
      nickname: data.nickname || '',
      email: data.email || '',
      avatar: data.avatar || '',
      realName: data.realName || '',
      institution: data.institution || '',
      department: data.department || '',
      studentId: data.studentId || '',
      orcid: data.orcid || '',
      researchArea: data.researchArea || ''
    })
  } catch (e) {
    setFeedback('error', '加载用户信息失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await updateProfile(form)
    // 更新本地缓存
    const stored = JSON.parse(localStorage.getItem('userInfo') || '{}')
    Object.assign(stored, form)
    localStorage.setItem('userInfo', JSON.stringify(stored))
    userStore.setUser(stored)
    setFeedback('success', '保存成功')
  } catch (e) {
    setFeedback('error', e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handlePasswordChange() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    setFeedback('error', '两次输入的密码不一致')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    setFeedback('error', '新密码至少需要 6 位')
    return
  }
  passwordSaving.value = true
  try {
    await updatePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
    setFeedback('success', '密码修改成功')
  } catch (e) {
    setFeedback('error', e?.message || '密码修改失败')
  } finally {
    passwordSaving.value = false
  }
}

onMounted(loadUserInfo)
</script>

<template>
  <div class="profile-container">
      <h2 class="profile-title">个人中心</h2>

      <!-- 反馈提示 -->
      <div v-if="feedback.text" :class="['feedback', feedback.type]">
        {{ feedback.text }}
      </div>

      <!-- 标签页切换 -->
      <div class="tab-bar">
        <button
          :class="['tab-btn', { active: activeTab === 'profile' }]"
          @click="activeTab = 'profile'"
        >基本信息</button>
        <button
          :class="['tab-btn', { active: activeTab === 'author' }]"
          @click="activeTab = 'author'"
        >作者信息</button>
        <button
          :class="['tab-btn', { active: activeTab === 'password' }]"
          @click="activeTab = 'password'"
        >修改密码</button>
      </div>

      <div v-if="loading" class="loading-text">加载中...</div>

      <!-- 基本信息 -->
      <form v-if="!loading && activeTab === 'profile'" class="form-section" @submit.prevent="handleSave">
        <div class="form-group">
          <label>昵称</label>
          <input v-model="form.nickname" maxlength="255" />
        </div>
        <div class="form-group">
          <label>邮箱</label>
          <input v-model="form.email" type="email" />
        </div>
        <div class="form-group">
          <label>头像 URL</label>
          <input v-model="form.avatar" placeholder="https://..." />
        </div>
        <button type="submit" class="save-btn" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </form>

      <!-- 作者信息 — 论文生成时自动填入 -->
      <form v-if="!loading && activeTab === 'author'" class="form-section" @submit.prevent="handleSave">
        <p class="section-hint">以下信息将在论文生成时自动填入作者栏。</p>
        <div class="form-group">
          <label>真实姓名</label>
          <input v-model="form.realName" maxlength="100" placeholder="张三" />
        </div>
        <div class="form-group">
          <label>所在单位</label>
          <input v-model="form.institution" maxlength="200" placeholder="清华大学" />
        </div>
        <div class="form-group">
          <label>院系/部门</label>
          <input v-model="form.department" maxlength="200" placeholder="计算机科学与技术系" />
        </div>
        <div class="form-group">
          <label>学号/工号</label>
          <input v-model="form.studentId" maxlength="50" placeholder="可选" />
        </div>
        <div class="form-group">
          <label>ORCID</label>
          <input v-model="form.orcid" maxlength="50" placeholder="0000-0000-0000-0000" />
        </div>
        <div class="form-group">
          <label>研究方向</label>
          <input v-model="form.researchArea" maxlength="500" placeholder="自然语言处理、计算机视觉" />
        </div>
        <button type="submit" class="save-btn" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </form>

      <!-- 修改密码 -->
      <form v-if="!loading && activeTab === 'password'" class="form-section" @submit.prevent="handlePasswordChange">
        <div class="form-group">
          <label>原密码</label>
          <input v-model="passwordForm.oldPassword" type="password" />
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input v-model="passwordForm.newPassword" type="password" minlength="6" />
        </div>
        <div class="form-group">
          <label>确认新密码</label>
          <input v-model="passwordForm.confirmPassword" type="password" minlength="6" />
        </div>
        <button type="submit" class="save-btn" :disabled="passwordSaving">
          {{ passwordSaving ? '修改中...' : '修改密码' }}
        </button>
      </form>
    </div>
</template>

<style scoped>
.profile-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

.profile-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: #1a1a2e;
}

.feedback {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.feedback.success { background: #d4edda; color: #155724; }
.feedback.error { background: #f8d7da; color: #721c24; }

.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e0e0e0;
}

.tab-btn {
  padding: 0.6rem 1.2rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #666;
  transition: all 0.2s;
}
.tab-btn:hover { color: #4a6cf7; }
.tab-btn.active {
  color: #4a6cf7;
  border-bottom-color: #4a6cf7;
  font-weight: 600;
}

.loading-text {
  text-align: center;
  color: #999;
  padding: 2rem;
}

.section-hint {
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 1rem;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.form-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
}
.form-group input {
  padding: 0.6rem 0.8rem;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: border-color 0.2s;
}
.form-group input:focus {
  outline: none;
  border-color: #4a6cf7;
  box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.15);
}

.save-btn {
  align-self: flex-start;
  padding: 0.6rem 1.8rem;
  background: #4a6cf7;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 0.5rem;
}
.save-btn:hover:not(:disabled) { background: #3b5de7; }
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
