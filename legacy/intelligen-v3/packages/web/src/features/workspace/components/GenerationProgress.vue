<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  taskSnapshot: { type: Object, default: null },
});

// Timeline stages with Chinese labels
const STAGE_ORDER = [
  { key: 'clarification', label: '需求确认', icon: '💬' },
  { key: 'planning', label: '规划大纲', icon: '📋' },
  { key: 'retrieving', label: '检索文献', icon: '🔍' },
  { key: 'writing', label: '撰写内容', icon: '✍️' },
  { key: 'quality_check', label: '质量检查', icon: '✅' },
  { key: 'normalizing', label: '格式化', icon: '📄' },
  { key: 'exporting', label: '导出', icon: '📦' },
];

const stageStartTimes = ref({});

const currentStage = computed(() => {
  return props.taskSnapshot?.stage || props.taskSnapshot?.currentStage || '';
});

const currentSectionTitle = computed(() => {
  return props.taskSnapshot?.sectionTitle || props.taskSnapshot?.section_title || '';
});

const progressPct = computed(() => {
  const snap = props.taskSnapshot;
  if (!snap) return 0;
  const current = snap.current || snap.sectionsCompleted || 0;
  const total = snap.total || snap.totalSections || 1;
  return Math.round((current / Math.max(total, 1)) * 100);
});

const completedSections = computed(() => {
  const snap = props.taskSnapshot;
  return snap?.current || snap?.sectionsCompleted || 0;
});

const totalSections = computed(() => {
  const snap = props.taskSnapshot;
  return snap?.total || snap?.totalSections || 0;
});

// Track stage transitions for timing
watch(currentStage, (newStage) => {
  if (newStage && !stageStartTimes.value[newStage]) {
    stageStartTimes.value[newStage] = Date.now();
  }
});

const stageStatuses = computed(() => {
  const current = currentStage.value;
  const currentIdx = STAGE_ORDER.findIndex((s) => s.key === current);

  return STAGE_ORDER.map((stage, idx) => {
    let status = 'pending';
    if (idx < currentIdx) status = 'done';
    else if (idx === currentIdx) status = 'active';
    return { ...stage, status };
  });
});

const estimatedRemaining = computed(() => {
  const snap = props.taskSnapshot;
  if (!snap) return '';
  const current = completedSections.value;
  const total = totalSections.value;
  if (current <= 0 || total <= 0 || current >= total) return '';

  const writingStart = stageStartTimes.value['writing'];
  if (!writingStart) return '';

  const elapsed = (Date.now() - writingStart) / 1000;
  const avgPerSection = elapsed / current;
  const remaining = avgPerSection * (total - current);

  if (remaining < 60) return `约 ${Math.round(remaining)} 秒`;
  return `约 ${Math.round(remaining / 60)} 分钟`;
});

const sourceCount = computed(() => {
  return props.taskSnapshot?.sourceCount || props.taskSnapshot?.source_count || 0;
});
</script>

<template>
  <div class="generation-progress" v-if="taskSnapshot">
    <!-- Progress bar -->
    <div class="progress-bar-wrapper">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
      <div class="progress-info">
        <span class="progress-pct">{{ progressPct }}%</span>
        <span v-if="totalSections > 0" class="progress-detail">
          {{ completedSections }}/{{ totalSections }} 章节
        </span>
        <span v-if="estimatedRemaining" class="progress-eta">
          预计剩余 {{ estimatedRemaining }}
        </span>
      </div>
    </div>

    <!-- Current section name -->
    <div v-if="currentSectionTitle && currentStage === 'writing'" class="current-section">
      <span class="section-indicator">✍️ 正在撰写：</span>
      <span class="section-name">{{ currentSectionTitle }}</span>
    </div>

    <!-- Source discovery -->
    <div v-if="sourceCount > 0 && (currentStage === 'retrieving' || currentStage === 'writing')" class="source-count">
      📚 已检索到 {{ sourceCount }} 个文献来源
    </div>

    <!-- Stage timeline -->
    <div class="stage-timeline">
      <div
        v-for="(stage, idx) in stageStatuses"
        :key="stage.key"
        class="stage-item"
        :class="stage.status"
      >
        <div class="stage-icon">
          <span v-if="stage.status === 'done'" class="check-icon">✓</span>
          <span v-else-if="stage.status === 'active'" class="active-spinner"></span>
          <span v-else class="pending-dot"></span>
        </div>
        <div class="stage-label">
          <span class="stage-emoji">{{ stage.icon }}</span>
          {{ stage.label }}
        </div>
        <div v-if="idx < stageStatuses.length - 1" class="stage-connector" :class="stage.status"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.generation-progress {
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg, 12px);
}

.progress-bar-wrapper {
  margin-bottom: 12px;
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary, #0070F3), #38bdf8);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
}

.progress-pct {
  font-weight: 700;
  color: var(--primary, #0070F3);
  font-size: 14px;
}

.progress-detail {
  color: var(--text-secondary, #888);
}

.progress-eta {
  color: var(--text-secondary, #666);
  font-style: italic;
}

.current-section {
  padding: 8px 12px;
  background: rgba(0, 112, 243, 0.06);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
}

.section-indicator {
  color: var(--text-secondary, #888);
}

.section-name {
  color: var(--text-primary, #f0f0f0);
  font-weight: 500;
}

.source-count {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-bottom: 12px;
  padding: 4px 0;
}

.stage-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  position: relative;
}

.stage-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.check-icon {
  width: 18px;
  height: 18px;
  background: var(--primary, #0070F3);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
}

.active-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 112, 243, 0.2);
  border-top-color: var(--primary, #0070F3);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.pending-dot {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
}

.stage-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  transition: color 0.3s;
}

.stage-item.done .stage-label {
  color: var(--text-secondary, #888);
}

.stage-item.active .stage-label {
  color: var(--text-primary, #f0f0f0);
  font-weight: 500;
}

.stage-emoji {
  margin-right: 4px;
}

.stage-connector {
  position: absolute;
  left: 10px;
  top: 28px;
  width: 2px;
  height: 12px;
  background: rgba(255, 255, 255, 0.08);
}

.stage-connector.done {
  background: var(--primary, #0070F3);
}

.stage-connector.active {
  background: linear-gradient(to bottom, var(--primary, #0070F3), rgba(255, 255, 255, 0.08));
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
