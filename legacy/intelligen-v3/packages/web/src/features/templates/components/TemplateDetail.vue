<script setup>
import { computed } from 'vue';

const props = defineProps({
  template: { type: Object, required: true },
});

const emit = defineEmits(['close', 'edit']);

const typeLabels = {
  builtin: '内置', journal: '期刊', school: '学校', custom: '自定义',
};
const statusLabels = {
  draft: '草稿', pending: '审核中', approved: '已审核', rejected: '已拒绝',
};
const statusColors = {
  draft: '#909399', pending: '#E6A23C', approved: '#67C23A', rejected: '#F56C6C',
};

const formatSections = computed(() => {
  const fj = props.template.formatJson;
  if (!fj) return [];
  return fj.sections || [];
});

const pageLayout = computed(() => props.template.formatJson?.page_layout || null);
const bodyStyle = computed(() => props.template.formatJson?.body_style || null);
const headingStyles = computed(() => props.template.formatJson?.heading_styles || []);
</script>

<template>
  <div class="detail-overlay" @click.self="emit('close')">
    <div class="detail-dialog">
      <div class="dialog-header">
        <div>
          <h3>{{ template.name }}</h3>
          <div class="header-meta">
            <span class="meta-tag">{{ typeLabels[template.type] || template.type }}</span>
            <span class="status-badge" :style="{ background: statusColors[template.status] }">
              {{ statusLabels[template.status] || template.status }}
            </span>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="dialog-body">
        <section v-if="template.description" class="info-section">
          <h4>描述</h4>
          <p>{{ template.description }}</p>
        </section>

        <section v-if="template.school" class="info-section">
          <h4>学校/院系</h4>
          <p>{{ template.school }}{{ template.department ? ' · ' + template.department : '' }}</p>
        </section>

        <section v-if="template.journalName" class="info-section">
          <h4>期刊</h4>
          <p>{{ template.journalName }}</p>
        </section>

        <section v-if="template.reviewNote" class="info-section">
          <h4>审核备注</h4>
          <p>{{ template.reviewNote }}</p>
        </section>

        <!-- Format Preview -->
        <section v-if="template.formatJson" class="info-section">
          <h4>格式定义预览</h4>

          <div v-if="pageLayout" class="format-block">
            <h5>页面布局</h5>
            <div class="format-grid">
              <span>纸张: {{ pageLayout.page_size || 'A4' }}</span>
              <span>上边距: {{ pageLayout.margin_top_cm }}cm</span>
              <span>下边距: {{ pageLayout.margin_bottom_cm }}cm</span>
              <span>左边距: {{ pageLayout.margin_left_cm }}cm</span>
              <span>右边距: {{ pageLayout.margin_right_cm }}cm</span>
            </div>
          </div>

          <div v-if="bodyStyle" class="format-block">
            <h5>正文样式</h5>
            <div class="format-grid">
              <span>字体: {{ bodyStyle.font_family }}</span>
              <span>字号: {{ bodyStyle.font_size_pt }}pt</span>
              <span>行距: {{ bodyStyle.line_spacing }}</span>
              <span>对齐: {{ bodyStyle.alignment }}</span>
            </div>
          </div>

          <div v-if="headingStyles.length" class="format-block">
            <h5>标题样式</h5>
            <div v-for="hs in headingStyles" :key="hs.level" class="heading-item">
              <span class="heading-level">H{{ hs.level }}</span>
              <span>{{ hs.font_family }} {{ hs.font_size_pt }}pt{{ hs.bold ? ' 粗体' : '' }}</span>
            </div>
          </div>

          <div v-if="formatSections.length" class="format-block">
            <h5>章节结构</h5>
            <div v-for="(s, i) in formatSections" :key="i" class="section-item">
              <span class="section-order">{{ i + 1 }}</span>
              <span>{{ s.title }}</span>
              <span v-if="s.required" class="required-badge">必需</span>
            </div>
          </div>
        </section>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
        <button class="btn btn-primary" @click="emit('edit', template)">编辑</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.detail-dialog {
  background: var(--surface);
  border-radius: 16px;
  width: 640px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-soft);
}
.dialog-header h3 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}
.header-meta { display: flex; gap: 8px; align-items: center; }
.meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-secondary);
}
.status-badge {
  font-size: 11px;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
}
.close-btn {
  background: none; border: none; font-size: 18px;
  color: var(--text-secondary); cursor: pointer;
}
.dialog-body { padding: 24px; }
.info-section { margin-bottom: 20px; }
.info-section h4 {
  font-size: 14px; font-weight: 600;
  color: var(--text-main); margin: 0 0 8px;
}
.info-section p {
  font-size: 13px; color: var(--text-secondary); margin: 0;
}
.format-block {
  background: var(--surface-strong);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.format-block h5 {
  font-size: 13px; font-weight: 600;
  color: var(--text-main); margin: 0 0 8px;
}
.format-grid {
  display: flex; flex-wrap: wrap; gap: 12px;
  font-size: 12px; color: var(--text-secondary);
}
.heading-item, .section-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--text-secondary);
  padding: 4px 0;
}
.heading-level {
  font-weight: 600; color: var(--primary);
  width: 24px;
}
.section-order {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.required-badge {
  font-size: 10px; color: #F56C6C; font-weight: 500;
}
.dialog-footer {
  display: flex; justify-content: flex-end; gap: 12px;
  padding: 16px 24px; border-top: 1px solid var(--border-soft);
}
.btn {
  padding: 8px 20px; border-radius: 8px; font-size: 14px;
  font-weight: 500; cursor: pointer; border: none; transition: all 0.2s;
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { opacity: 0.9; }
.btn-secondary {
  background: var(--surface-strong); color: var(--text-main);
  border: 1px solid var(--border-soft);
}
.btn-secondary:hover { background: var(--surface); }
</style>
