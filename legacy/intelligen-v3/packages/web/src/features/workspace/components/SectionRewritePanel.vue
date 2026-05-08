<script setup>
import { ref, computed, watch } from 'vue';
import { rewriteSection } from '@/features/workspace/api/task';

const props = defineProps({
  visible: { type: Boolean, default: false },
  taskId: { type: String, default: '' },
  sectionIndex: { type: Number, default: -1 },
  sectionTitle: { type: String, default: '' },
  sectionContent: { type: String, default: '' },
  paperTitle: { type: String, default: '' },
});

const emit = defineEmits(['close', 'accept', 'reject']);

const feedback = ref('');
const loading = ref(false);
const error = ref('');
const newContent = ref('');
const diffLines = ref([]);
const rewritten = ref(false);

watch(() => props.visible, (val) => {
  if (val) {
    feedback.value = '';
    error.value = '';
    newContent.value = '';
    diffLines.value = [];
    rewritten.value = false;
  }
});

// 简易 diff: 按行比较生成差异
function computeDiffLines(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  // 简易 LCS 算法用于更精确的行级 diff
  const lcs = buildLCS(oldLines, newLines);
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li]) {
      if (ni < newLines.length && newLines[ni] === lcs[li]) {
        result.push({ type: 'equal', text: lcs[li] });
        oi++;
        ni++;
        li++;
      } else if (ni < newLines.length) {
        result.push({ type: 'add', text: newLines[ni] });
        ni++;
      } else {
        result.push({ type: 'remove', text: oldLines[oi] });
        oi++;
      }
    } else if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
      result.push({ type: 'remove', text: oldLines[oi] });
      oi++;
    } else if (ni < newLines.length) {
      result.push({ type: 'add', text: newLines[ni] });
      ni++;
    } else {
      break;
    }
  }

  return result;
}

function buildLCS(a, b) {
  const m = a.length;
  const n = b.length;
  // 限制复杂度：超大文本直接逐行比较
  if (m * n > 100000) {
    return simpleCommon(a, b);
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

function simpleCommon(a, b) {
  const setB = new Set(b);
  return a.filter((line) => setB.has(line));
}

const addedCount = computed(() => diffLines.value.filter((l) => l.type === 'add').length);
const removedCount = computed(() => diffLines.value.filter((l) => l.type === 'remove').length);

async function handleRewrite() {
  if (!feedback.value.trim()) {
    error.value = '请输入修改意见';
    return;
  }
  loading.value = true;
  error.value = '';

  try {
    const res = await rewriteSection(props.taskId, String(props.sectionIndex), {
      feedback: feedback.value,
      originalContent: props.sectionContent,
      context: {
        title: props.paperTitle,
        section_title: props.sectionTitle,
      },
    });

    const data = res?.data?.data || res?.data;
    if (data?.newContent) {
      newContent.value = data.newContent;
      diffLines.value = computeDiffLines(props.sectionContent, data.newContent);
      rewritten.value = true;
    } else {
      error.value = data?.message || '重写返回内容为空';
    }
  } catch (e) {
    error.value = e?.response?.data?.message || e.message || '重写请求失败';
  } finally {
    loading.value = false;
  }
}

function handleAccept() {
  emit('accept', {
    sectionIndex: props.sectionIndex,
    newContent: newContent.value,
  });
}

function handleReject() {
  emit('reject');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="visible" class="rewrite-overlay" @click.self="handleClose">
        <div class="rewrite-panel">
          <!-- 头部 -->
          <div class="rw-header">
            <div class="rw-header-left">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span class="rw-title">章节重写</span>
            </div>
            <button class="rw-close" @click="handleClose" title="关闭">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- 章节信息 -->
          <div class="rw-section-info">
            <span class="rw-section-label">{{ sectionTitle || `章节 ${sectionIndex + 1}` }}</span>
          </div>

          <!-- 原始内容 -->
          <div class="rw-original">
            <div class="rw-sub-header">原始内容</div>
            <div class="rw-original-content">{{ sectionContent }}</div>
          </div>

          <!-- 反馈输入 (重写前) -->
          <div v-if="!rewritten" class="rw-feedback-area">
            <div class="rw-sub-header">修改意见</div>
            <textarea
              v-model="feedback"
              class="rw-textarea"
              placeholder="例如：这部分需要更加深入，增加对比分析…"
              rows="4"
              :disabled="loading"
              @keydown.ctrl.enter="handleRewrite"
              @keydown.meta.enter="handleRewrite"
            />
            <div class="rw-actions">
              <button class="rw-btn rw-btn-cancel" @click="handleClose" :disabled="loading">取消</button>
              <button class="rw-btn rw-btn-primary" @click="handleRewrite" :disabled="loading || !feedback.trim()">
                <span v-if="loading" class="rw-spinner" />
                {{ loading ? '重写中…' : '重写 (Ctrl+Enter)' }}
              </button>
            </div>
          </div>

          <!-- Diff 视图 (重写后) -->
          <div v-if="rewritten" class="rw-diff-area">
            <div class="rw-diff-header">
              <span class="rw-sub-header">内容对比</span>
              <span class="rw-diff-stats">
                <span class="rw-stat-add">+{{ addedCount }}</span>
                <span class="rw-stat-remove">-{{ removedCount }}</span>
              </span>
            </div>
            <div class="rw-diff-view">
              <div
                v-for="(line, idx) in diffLines"
                :key="idx"
                class="rw-diff-line"
                :class="'rw-diff-' + line.type"
              >
                <span class="rw-diff-marker">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>
                <span class="rw-diff-text">{{ line.text || '\u00A0' }}</span>
              </div>
            </div>
            <div class="rw-actions">
              <button class="rw-btn rw-btn-cancel" @click="handleReject">拒绝</button>
              <button class="rw-btn rw-btn-rewrite" @click="rewritten = false; feedback = '';">再次修改</button>
              <button class="rw-btn rw-btn-accept" @click="handleAccept">接受修改</button>
            </div>
          </div>

          <!-- 错误信息 -->
          <div v-if="error" class="rw-error">⚠️ {{ error }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rewrite-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
  animation: fade-in 0.2s ease;
}

.rewrite-panel {
  width: min(600px, 90vw);
  height: 100vh;
  background: var(--surface, #fff);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.rw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-soft, #e5e7eb);
  flex-shrink: 0;
}
.rw-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary, #111827);
}
.rw-title {
  font-weight: 600;
  font-size: 16px;
}
.rw-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-secondary, #6b7280);
  border-radius: 8px;
  transition: background 0.15s;
}
.rw-close:hover {
  background: var(--hover-bg, #f3f4f6);
}

/* 章节信息 */
.rw-section-info {
  padding: 12px 20px;
  background: var(--accent-light, #eef2ff);
  flex-shrink: 0;
}
.rw-section-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent, #6366f1);
}

/* 子标题 */
.rw-sub-header {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary, #9ca3af);
  margin-bottom: 8px;
}

/* 原始内容 */
.rw-original {
  padding: 16px 20px;
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}
.rw-original-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #6b7280);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border-soft, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-muted, #f9fafb);
}

/* 反馈输入区 */
.rw-feedback-area {
  padding: 16px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.rw-textarea {
  flex: 1;
  min-height: 80px;
  padding: 12px;
  border: 1px solid var(--border-soft, #e5e7eb);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  color: var(--text-primary, #111827);
  background: var(--surface, #fff);
  transition: border-color 0.15s;
}
.rw-textarea:focus {
  outline: none;
  border-color: var(--accent, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* Diff 区域 */
.rw-diff-area {
  padding: 16px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.rw-diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rw-diff-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}
.rw-stat-add {
  color: #16a34a;
}
.rw-stat-remove {
  color: #dc2626;
}

.rw-diff-view {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-soft, #e5e7eb);
  border-radius: 8px;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.rw-diff-line {
  display: flex;
  padding: 1px 8px;
  min-height: 20px;
}
.rw-diff-marker {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  user-select: none;
  color: var(--text-tertiary, #9ca3af);
}
.rw-diff-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.rw-diff-equal {
  background: transparent;
}
.rw-diff-add {
  background: rgba(22, 163, 74, 0.08);
}
.rw-diff-add .rw-diff-marker {
  color: #16a34a;
}
.rw-diff-add .rw-diff-text {
  color: #15803d;
}
.rw-diff-remove {
  background: rgba(220, 38, 38, 0.06);
}
.rw-diff-remove .rw-diff-marker {
  color: #dc2626;
}
.rw-diff-remove .rw-diff-text {
  color: #b91c1c;
  text-decoration: line-through;
}

/* 操作按钮 */
.rw-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  flex-shrink: 0;
}
.rw-btn {
  padding: 8px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-soft, #e5e7eb);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rw-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rw-btn-cancel {
  background: var(--surface, #fff);
  color: var(--text-secondary, #6b7280);
}
.rw-btn-cancel:hover:not(:disabled) {
  background: var(--hover-bg, #f3f4f6);
}
.rw-btn-primary {
  background: var(--accent, #6366f1);
  color: #fff;
  border-color: var(--accent, #6366f1);
}
.rw-btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}
.rw-btn-accept {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}
.rw-btn-accept:hover:not(:disabled) {
  background: #15803d;
}
.rw-btn-rewrite {
  background: var(--surface, #fff);
  color: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
}
.rw-btn-rewrite:hover:not(:disabled) {
  background: var(--accent-light, #eef2ff);
}

/* 错误 */
.rw-error {
  padding: 10px 20px;
  color: #dc2626;
  font-size: 13px;
  flex-shrink: 0;
}

/* Spinner */
.rw-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rw-spin 0.6s linear infinite;
}

@keyframes rw-spin {
  to { transform: rotate(360deg); }
}

/* 过渡动画 */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.panel-slide-enter-active {
  animation: fade-in 0.2s ease;
}
.panel-slide-enter-active .rewrite-panel {
  animation: slide-in 0.25s ease;
}
.panel-slide-leave-active {
  animation: fade-in 0.15s ease reverse;
}

@keyframes slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>
