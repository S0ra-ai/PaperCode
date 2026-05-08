<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  data: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close']);
const modalRef = ref(null);

// Escape键关闭处理
function handleKeydown(e) {
  if (props.show && e.key === 'Escape') {
    handleClose('modify');
  }
}

import { watch } from 'vue';

watch(() => props.show, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
    nextTick(() => {
      // 聚焦"返回修改"按钮
      if (modalRef.value && primaryBtn.value) {
        primaryBtn.value.focus();
      } else if (modalRef.value) {
        modalRef.value.focus();
      }
    });
  } else {
    document.body.style.overflow = '';
  }
});

const primaryBtn = ref(null);

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});

// 聚焦管理，当内容显示时将焦点移到模态框上，防止后台滚动和操作

function handleClose(decision) {
  emit('close', decision);
}



// 计算属性：安全级别样式
const riskClass = computed(() => {
  const level = props.data?.risk_level || 'high';
  return `risk-${level}`;
});
</script>

<template>
  <Transition name="fade-glass">
    <div v-if="show" class="safety-block-overlay" @mousedown.self="handleClose('modify')">
      <div 
        class="safety-block-modal" 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="safety-modal-title"
        ref="modalRef"
        tabindex="-1"
      >
        
        <!-- Header -->
        <div class="modal-header">
          <div class="icon-wrapper" :class="riskClass">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="alert-icon">
              <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zm.41 3.997a.75.75 0 011.5 0v6a.75.75 0 01-1.5 0v-6zm1.5 9.75a.75.75 0 10-1.5 0 .75.75 0 001.5 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <h2 id="safety-modal-title" class="modal-title">内容安全拦截</h2>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <p class="main-message">{{ data?.msg || '您的输入包含敏感或违禁内容，已被安全策略拦截。' }}</p>


          
          <div class="draft-notice">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="info-icon">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
            </svg>
            <span>系统已为您保留刚才的草稿，您可以修改后重新提交。</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="handleClose('abandon')">放弃草稿</button>
          <button type="button" class="btn btn-primary" @click="handleClose('modify')" ref="primaryBtn">返回修改</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Transition */
.fade-glass-enter-active,
.fade-glass-leave-active {
  transition: opacity 0.3s ease, backdrop-filter 0.3s ease;
}
.fade-glass-enter-from,
.fade-glass-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
.fade-glass-enter-active .safety-block-modal,
.fade-glass-leave-active .safety-block-modal {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}
.fade-glass-enter-from .safety-block-modal {
  transform: translateY(20px) scale(0.96);
  opacity: 0;
}
.fade-glass-leave-to .safety-block-modal {
  transform: translateY(10px) scale(0.98);
  opacity: 0;
}

/* Overlay */
.safety-block-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(10, 10, 10, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 1rem;
}

/* Modal */
.safety-block-modal {
  background: linear-gradient(145deg, rgba(30, 30, 35, 0.8) 0%, rgba(20, 20, 25, 0.95) 100%);
  border: 1px solid rgba(255, 60, 60, 0.15);
  border-top: 1px solid rgba(255, 80, 80, 0.25);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(220, 38, 38, 0.1) inset;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  outline: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background-color: rgba(220, 38, 38, 0.1);
  color: #ef4444;
}

.risk-critical, .risk-high {
  background-color: rgba(220, 38, 38, 0.15);
  color: #ef4444;
  box-shadow: 0 0 15px rgba(220, 38, 38, 0.2);
}

.risk-medium {
  background-color: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.alert-icon {
  width: 24px;
  height: 24px;
}

.modal-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #f9fafb;
  letter-spacing: 0.025em;
}

/* Body */
.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.main-message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #d1d5db;
}


/* Notice */
.draft-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #9ca3af;
  padding: 12px;
  background-color: rgba(59, 130, 246, 0.05);
  border-left: 3px solid rgba(59, 130, 246, 0.4);
  border-radius: 4px;
}

.info-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: #60a5fa;
}

/* Footer */
.modal-footer {
  padding: 16px 24px;
  background-color: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  border: none;
  background: none;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.btn-ghost {
  color: #9ca3af;
}

.btn-ghost:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #f3f4f6;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover {
  background-color: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}
</style>
