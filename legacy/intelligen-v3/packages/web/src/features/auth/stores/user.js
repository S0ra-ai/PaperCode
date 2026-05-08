import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

function readJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const useUserStore = defineStore('user', () => {
  const userInfo = ref(readJson('userInfo'));

  const isLoggedIn = computed(() => Boolean(userInfo.value));
  const isAdmin = computed(() => userInfo.value?.role === 'admin');

  function setSession(payload) {
    userInfo.value = {
      userId: payload.userId,
      username: payload.username,
      nickname: payload.nickname,
      email: payload.email,
      role: payload.role,
      authStatus: payload.authStatus,
      avatar: payload.avatar
    };
    localStorage.setItem('userInfo', JSON.stringify(userInfo.value));
  }

  function updateUserInfo(payload) {
    userInfo.value = payload;
    localStorage.setItem('userInfo', JSON.stringify(payload));
  }

  function clearSession() {
    userInfo.value = null;
    localStorage.removeItem('userInfo');
  }

  return {
    userInfo,
    isLoggedIn,
    isAdmin,
    setSession,
    updateUserInfo,
    clearSession
  };
});
