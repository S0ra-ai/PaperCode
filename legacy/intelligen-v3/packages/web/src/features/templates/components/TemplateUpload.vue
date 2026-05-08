<script setup>
import { ref, reactive } from 'vue';

const emit = defineEmits(['submit', 'cancel']);

const visible = ref(true);
const loading = ref(false);

const form = reactive({
  name: '',
  description: '',
  type: 'custom',
  school: '',
  department: '',
  journalName: '',
  sourceFile: null,
});

const typeOptions = [
  { value: 'custom', label: '自定义模板' },
  { value: 'school', label: '学校模板' },
  { value: 'journal', label: '期刊模板' },
];

function handleFileChange(e) {
  const file = e.target.files?.[0];
  if (file) {
    form.sourceFile = file;
  }
}

async function handleSubmit() {
  if (!form.name.trim()) return;
  loading.value = true;

  try {
    const data = {
      name: form.name,
      description: form.description,
      type: form.type,
      school: form.school || null,
      department: form.department || null,
      journal_name: form.journalName || null,
    };
    emit('submit', { data, file: form.sourceFile });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div v-if="visible" class="upload-overlay" @click.self="emit('cancel')">
    <div class="upload-dialog">
      <div class="dialog-header">
        <h3>上传模板</h3>
        <button class="close-btn" @click="emit('cancel')">✕</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>模板名称 <span class="required">*</span></label>
          <input v-model="form.name" class="form-input" placeholder="输入模板名称" maxlength="200" />
        </div>

        <div class="form-group">
          <label>描述</label>
          <textarea v-model="form.description" class="form-input textarea" placeholder="模板描述（可选）" rows="3" />
        </div>

        <div class="form-group">
          <label>模板类型</label>
          <select v-model="form.type" class="form-input">
            <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div v-if="form.type === 'school'" class="form-row">
          <div class="form-group">
            <label>学校</label>
            <input v-model="form.school" class="form-input" placeholder="学校名称" />
          </div>
          <div class="form-group">
            <label>院系</label>
            <input v-model="form.department" class="form-input" placeholder="院系名称" />
          </div>
        </div>

        <div v-if="form.type === 'journal'" class="form-group">
          <label>期刊名称</label>
          <input v-model="form.journalName" class="form-input" placeholder="期刊名称" />
        </div>

        <div class="form-group">
          <label>参考文件（可选）</label>
          <div class="file-upload-area">
            <input type="file" accept=".pdf,.doc,.docx,.txt" @change="handleFileChange" />
            <p v-if="form.sourceFile" class="file-name">{{ form.sourceFile.name }}</p>
            <p v-else class="file-hint">支持 PDF、Word、TXT 格式</p>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="emit('cancel')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!form.name.trim() || loading"
          @click="handleSubmit"
        >
          {{ loading ? '创建中...' : '创建模板' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.upload-dialog {
  background: var(--surface);
  border-radius: 16px;
  width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-soft);
}
.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}
.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
}
.dialog-body {
  padding: 24px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
  margin-bottom: 6px;
}
.required { color: #F56C6C; }
.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--primary);
}
.form-input.textarea {
  resize: vertical;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.file-upload-area {
  border: 2px dashed var(--border-soft);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.file-name {
  font-size: 13px;
  color: var(--primary);
  margin: 8px 0 0;
}
.file-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 8px 0 0;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-soft);
}
.btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: var(--surface-strong);
  color: var(--text-main);
  border: 1px solid var(--border-soft);
}
.btn-secondary:hover {
  background: var(--surface);
}
</style>
