<script setup>
/**
 * @deprecated Replaced by inline clarification flow (ClarificationMessage.vue + RequirementSummaryCard.vue).
 * Kept as fallback for batch mode when no session is selected.
 */
import { ref, computed, nextTick, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  topic: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  sessionId: { type: String, default: '' },
});

const emit = defineEmits(['close', 'finish', 'update:topic']);

// ─── State ───────────────────────────────────────────────
const messages = ref([]);
const history = ref([]);
const documentInfo = ref(null);
const currentQuestion = ref(null);
const isComplete = ref(false);
const step = ref(0);
const userInput = ref('');
const selectedOptions = ref([]);
const chatScrollEl = ref(null);
const isProcessing = ref(false);

const canSend = computed(() => {
  if (isProcessing.value || props.loading) return false;
  if (selectedOptions.value.length > 0) return true;
  return userInput.value.trim().length > 0;
});

const canFinish = computed(() => history.value.length >= 1 && !isProcessing.value);

// ─── API calls ───────────────────────────────────────────
import { clarifyNext, clarifyAnswer, clarifySkip, clarifyFinish } from '@/features/workspace/api/task';

async function fetchNextQuestion() {
  if (!props.sessionId || !props.topic) return;
  isProcessing.value = true;
  try {
    const res = await clarifyNext(props.sessionId, {
      topic: props.topic,
      history: history.value,
      documentInfo: documentInfo.value,
    });
    const data = res?.data ?? res;
    if (data) {
      currentQuestion.value = data.question || null;
      isComplete.value = data.isComplete || false;
      step.value = data.step || 0;

      if (data.question && !data.isComplete) {
        messages.value.push({
          role: 'assistant',
          type: 'question',
          text: data.question.question,
          options: data.question.options || [],
          allowMultiple: data.question.allowMultiple || false,
          explanation: data.question.explanation || '',
          step: data.step,
        });
        await scrollToBottom();
      }
    }
  } catch (e) {
    messages.value.push({
      role: 'system',
      type: 'error',
      text: '获取问题失败，请重试',
    });
  } finally {
    isProcessing.value = false;
  }
}

async function submitAnswer() {
  if (!canSend.value) return;
  const answer = selectedOptions.value.length > 0
    ? selectedOptions.value.join(', ')
    : userInput.value.trim();

  if (!answer) return;

  messages.value.push({ role: 'user', type: 'answer', text: answer });
  userInput.value = '';
  selectedOptions.value = [];
  isProcessing.value = true;

  try {
    const res = await clarifyAnswer(props.sessionId, {
      topic: props.topic,
      answer,
      history: history.value,
      documentInfo: documentInfo.value,
    });
    const data = res?.data ?? res;
    if (data) {
      // Update history from response
      history.value.push({ question: currentQuestion.value?.question || '', answer });
      currentQuestion.value = data.question || null;
      isComplete.value = data.isComplete || false;
      step.value = data.step || 0;

      if (data.isComplete) {
        messages.value.push({
          role: 'system',
          type: 'complete',
          text: '所有问题已回答完毕，正在生成需求总结...',
        });
        await handleFinish();
      } else if (data.question) {
        messages.value.push({
          role: 'assistant',
          type: 'question',
          text: data.question.question,
          options: data.question.options || [],
          allowMultiple: data.question.allowMultiple || false,
          explanation: data.question.explanation || '',
          step: data.step,
        });
      }
    }
  } catch (e) {
    messages.value.push({
      role: 'system',
      type: 'error',
      text: '提交回答失败，请重试',
    });
  } finally {
    isProcessing.value = false;
    await scrollToBottom();
  }
}

async function handleSkip() {
  isProcessing.value = true;
  messages.value.push({ role: 'user', type: 'skip', text: '(跳过此问题)' });

  try {
    const res = await clarifySkip(props.sessionId, {
      topic: props.topic,
      history: history.value,
      documentInfo: documentInfo.value,
    });
    const data = res?.data ?? res;
    if (data) {
      history.value.push({ question: currentQuestion.value?.question || '', answer: '(跳过)' });
      currentQuestion.value = data.question || null;
      isComplete.value = data.isComplete || false;
      step.value = data.step || 0;

      if (data.isComplete) {
        await handleFinish();
      } else if (data.question) {
        messages.value.push({
          role: 'assistant',
          type: 'question',
          text: data.question.question,
          options: data.question.options || [],
          allowMultiple: data.question.allowMultiple || false,
          explanation: data.question.explanation || '',
          step: data.step,
        });
      }
    }
  } catch (e) {
    messages.value.push({
      role: 'system',
      type: 'error',
      text: '跳过失败，请重试',
    });
  } finally {
    isProcessing.value = false;
    await scrollToBottom();
  }
}

async function handleFinish() {
  isProcessing.value = true;
  try {
    const res = await clarifyFinish(props.sessionId, {
      topic: props.topic,
      history: history.value,
      documentInfo: documentInfo.value,
    });
    const data = res?.data ?? res;
    if (data) {
      messages.value.push({
        role: 'system',
        type: 'summary',
        text: data.requirement || '需求总结完成',
        summary: data.summary || {},
      });
      emit('finish', {
        requirement: data.requirement || '',
        summary: data.summary || {},
        history: history.value,
      });
    }
  } catch (e) {
    messages.value.push({
      role: 'system',
      type: 'error',
      text: '生成总结失败，请重试',
    });
  } finally {
    isProcessing.value = false;
    await scrollToBottom();
  }
}

function toggleOption(option) {
  const idx = selectedOptions.value.indexOf(option);
  if (idx >= 0) {
    selectedOptions.value.splice(idx, 1);
  } else {
    if (currentQuestion.value?.allowMultiple) {
      selectedOptions.value.push(option);
    } else {
      selectedOptions.value = [option];
    }
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    submitAnswer();
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight;
  }
}

// Start first question when dialog becomes visible
watch(() => props.visible, (val) => {
  if (val && messages.value.length === 0) {
    messages.value.push({
      role: 'system',
      type: 'greeting',
      text: `让我帮你更好地理解你关于「${props.topic}」的需求。我会逐一问你几个问题来细化方向。`,
    });
    fetchNextQuestion();
  }
}, { immediate: true });

function setDocumentInfo(info) {
  documentInfo.value = info;
}

function reset() {
  messages.value = [];
  history.value = [];
  documentInfo.value = null;
  currentQuestion.value = null;
  isComplete.value = false;
  step.value = 0;
  userInput.value = '';
  selectedOptions.value = [];
}

defineExpose({ setDocumentInfo, reset });
</script>

<template>
  <div v-if="visible" class="clarify-chat" role="dialog" aria-label="需求澄清">
    <div class="clarify-header">
      <div class="header-left">
        <span class="header-icon">💬</span>
        <span class="header-title">需求澄清</span>
        <span v-if="step > 0" class="step-badge">问题 {{ step }} / 6</span>
      </div>
      <div class="header-actions">
        <button
          v-if="canFinish"
          class="btn btn-accent btn-mini"
          type="button"
          :disabled="isProcessing"
          @click="handleFinish"
        >
          直接生成
        </button>
        <button class="btn-icon" type="button" @click="emit('close')" title="关闭">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div class="clarify-messages" ref="chatScrollEl">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="chat-bubble"
        :class="[msg.role, msg.type]"
      >
        <!-- System messages -->
        <div v-if="msg.role === 'system'" class="system-bubble">
          <span v-if="msg.type === 'error'" class="error-icon">⚠️</span>
          <span v-else-if="msg.type === 'complete'" class="complete-icon">✅</span>
          <span v-else-if="msg.type === 'summary'" class="summary-icon">📋</span>
          <span v-else class="info-icon">ℹ️</span>
          <span>{{ msg.text }}</span>
        </div>

        <!-- Assistant question -->
        <div v-else-if="msg.role === 'assistant'" class="assistant-bubble">
          <div class="bubble-avatar">AI</div>
          <div class="bubble-content">
            <p class="question-text">{{ msg.text }}</p>
            <p v-if="msg.explanation" class="explanation-text">{{ msg.explanation }}</p>
            <div v-if="msg.options?.length && i === messages.length - 1 && !isComplete" class="option-cards">
              <button
                v-for="opt in msg.options"
                :key="opt"
                class="option-card"
                :class="{ selected: selectedOptions.includes(opt) }"
                type="button"
                @click="toggleOption(opt)"
              >
                <span class="option-check">{{ selectedOptions.includes(opt) ? '✓' : '' }}</span>
                {{ opt }}
              </button>
            </div>
            <div v-else-if="msg.options?.length" class="option-cards readonly">
              <span v-for="opt in msg.options" :key="opt" class="option-card disabled">{{ opt }}</span>
            </div>
          </div>
        </div>

        <!-- User answer -->
        <div v-else-if="msg.role === 'user'" class="user-bubble">
          <div class="bubble-content">
            <p :class="{ 'skip-text': msg.type === 'skip' }">{{ msg.text }}</p>
          </div>
        </div>
      </div>

      <div v-if="isProcessing" class="typing-indicator">
        <div class="bubble-avatar">AI</div>
        <div class="dots"><span /><span /><span /></div>
      </div>
    </div>

    <div v-if="!isComplete" class="clarify-input-area">
      <div class="input-row">
        <textarea
          v-model="userInput"
          class="clarify-input"
          placeholder="输入你的回答，或选择上方选项... (Ctrl+Enter 发送)"
          rows="2"
          @keydown="handleKeydown"
        />
        <div class="input-actions">
          <button
            class="btn btn-ghost btn-mini"
            type="button"
            :disabled="isProcessing || !currentQuestion"
            @click="handleSkip"
          >
            跳过
          </button>
          <button
            class="btn btn-accent btn-mini"
            type="button"
            :disabled="!canSend"
            @click="submitAnswer"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clarify-chat {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  max-height: 520px;
}

.clarify-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface-strong);
}
.header-left { display: flex; align-items: center; gap: 10px; }
.header-icon { font-size: 18px; }
.header-title { font-weight: 600; color: var(--text-main); font-size: 15px; }
.step-badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  font-weight: 500;
}
.header-actions { display: flex; align-items: center; gap: 8px; }

.clarify-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 160px;
}

.system-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.06);
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  justify-content: center;
}
.chat-bubble.system.error .system-bubble { background: rgba(248, 113, 113, 0.08); color: #f87171; }
.chat-bubble.system.summary .system-bubble { background: rgba(52, 211, 153, 0.08); color: #34d399; }

.assistant-bubble {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.bubble-avatar {
  width: 32px; height: 32px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}
.bubble-content {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--surface-strong);
  border: 1px solid var(--border-soft);
}
.question-text { margin: 0; color: var(--text-main); font-size: 14px; line-height: 1.6; }
.explanation-text { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; }

.option-cards { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.option-card {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.option-card:hover { border-color: #818cf8; color: var(--text-main); }
.option-card.selected {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  font-weight: 500;
}
.option-card.disabled {
  cursor: default;
  opacity: 0.6;
}
.option-check { font-size: 12px; min-width: 14px; color: #818cf8; }
.option-cards.readonly .option-card { cursor: default; }

.user-bubble {
  display: flex;
  justify-content: flex-end;
}
.user-bubble .bubble-content {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.2);
}
.user-bubble .bubble-content p { margin: 0; color: var(--text-main); font-size: 14px; }
.skip-text { color: var(--text-muted) !important; font-style: italic; }

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dots { display: flex; gap: 4px; padding: 8px 12px; }
.dots span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: dotPulse 1.4s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.clarify-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border-soft);
  background: var(--surface-strong);
}
.input-row { display: flex; gap: 10px; align-items: flex-end; }
.clarify-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 14px;
  background: var(--surface);
  color: var(--text-main);
  outline: none;
  transition: border-color 0.2s;
  line-height: 1.6;
}
.clarify-input:focus { border-color: #818cf8; }
.clarify-input::placeholder { color: var(--text-muted); }
.input-actions { display: flex; flex-direction: column; gap: 6px; }

.btn-icon { background: transparent; border: none; color: var(--text-main); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-icon:hover { background: var(--surface-muted); }
</style>
