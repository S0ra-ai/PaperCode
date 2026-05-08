<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  message: { type: Object, required: true },
});

const emit = defineEmits(['answer']);

const selectedOptions = ref([]);
const customInput = ref('');

const isAnswered = computed(() => props.message.answered);
const isMultiSelect = computed(() => props.message.multiSelect);

function toggleOption(option) {
  if (isAnswered.value) return;

  if (isMultiSelect.value) {
    const idx = selectedOptions.value.indexOf(option);
    if (idx >= 0) {
      selectedOptions.value.splice(idx, 1);
    } else {
      selectedOptions.value.push(option);
    }
  } else {
    // 单选模式，直接提交
    selectedOptions.value = [option];
    emit('answer', props.message.questionId, option);
  }
}

function submitMultiSelect() {
  if (selectedOptions.value.length === 0) return;
  emit('answer', props.message.questionId, selectedOptions.value.join(', '));
}

function submitCustom() {
  const text = customInput.value.trim();
  if (!text) return;
  emit('answer', props.message.questionId, text);
}

function handleCustomKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitCustom();
  }
}
</script>

<template>
  <div class="clarify-msg">
    <div class="clarify-msg-avatar">AI</div>
    <div class="clarify-msg-body">
      <p class="clarify-msg-text">{{ message.content }}</p>
      <p v-if="message.explanation" class="clarify-msg-hint">{{ message.explanation }}</p>

      <!-- 选项药丸 -->
      <div v-if="message.options?.length" class="clarify-pill-group">
        <button
          v-for="opt in message.options"
          :key="opt"
          class="clarify-pill"
          :class="{
            selected: selectedOptions.includes(opt) || message.selectedAnswer === opt,
            disabled: isAnswered,
            dimmed: isAnswered && message.selectedAnswer !== opt && !selectedOptions.includes(opt),
          }"
          :disabled="isAnswered"
          @click="toggleOption(opt)"
        >
          <span
            v-if="selectedOptions.includes(opt) || message.selectedAnswer === opt"
            class="pill-check"
          >✓</span>
          {{ opt }}
        </button>
      </div>

      <!-- 多选确认 -->
      <button
        v-if="isMultiSelect && !isAnswered && selectedOptions.length > 0"
        class="clarify-multi-confirm"
        @click="submitMultiSelect"
      >
        确认选择 ({{ selectedOptions.length }})
      </button>

      <!-- 自定义输入 -->
      <div v-if="message.allowCustom && !isAnswered" class="clarify-custom-row">
        <input
          v-model="customInput"
          class="clarify-custom-input"
          placeholder="自定义输入..."
          @keydown="handleCustomKeydown"
        />
        <button
          v-if="customInput.trim()"
          class="clarify-custom-send"
          @click="submitCustom"
        >发送</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clarify-msg {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.clarify-msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-soft);
  background: var(--surface-strong);
  color: var(--text-main);
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.clarify-msg-body {
  flex: 1;
  min-width: 0;
  max-width: min(760px, 88%);
  padding: 14px 18px;
  border-radius: 20px;
  background: var(--surface-strong);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
}

.clarify-msg-text {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.7;
}

.clarify-msg-hint {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

/* 药丸选项 */
.clarify-pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.clarify-pill {
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
}

.clarify-pill:not(.disabled):hover {
  border-color: #818cf8;
  color: var(--text-main);
  background: rgba(99, 102, 241, 0.06);
}

.clarify-pill.selected {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.14);
  color: #818cf8;
  font-weight: 600;
}

.clarify-pill.disabled {
  cursor: default;
  pointer-events: none;
}

.clarify-pill.dimmed {
  opacity: 0.45;
}

.pill-check {
  font-size: 12px;
  color: #818cf8;
}

/* 多选确认按钮 */
.clarify-multi-confirm {
  margin-top: 10px;
  padding: 6px 18px;
  border-radius: 999px;
  border: none;
  background: #818cf8;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.clarify-multi-confirm:hover {
  background: #6366f1;
}

/* 自定义输入 */
.clarify-custom-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.clarify-custom-input {
  flex: 1;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.clarify-custom-input:focus {
  border-color: #818cf8;
}

.clarify-custom-input::placeholder {
  color: var(--text-muted);
}

.clarify-custom-send {
  padding: 6px 16px;
  border-radius: 999px;
  border: none;
  background: #818cf8;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.clarify-custom-send:hover {
  background: #6366f1;
}
</style>
