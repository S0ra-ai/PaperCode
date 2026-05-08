<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: 'GB/T 7714' },
});

const emit = defineEmits(['update:modelValue']);

const hoveredStyle = ref('');

const styles = [
  {
    value: 'GB/T 7714',
    label: 'GB/T 7714',
    desc: '中国国家标准',
    example: '[1] 张三, 李四. 人工智能综述. 计算机学报, 2024. https://doi.org/...',
  },
  {
    value: 'APA',
    label: 'APA',
    desc: 'American Psychological Association',
    example: 'Zhang, S., & Li, S. (2024). A survey on artificial intelligence. *Journal of Computers*. https://doi.org/...',
  },
  {
    value: 'MLA',
    label: 'MLA',
    desc: 'Modern Language Association',
    example: 'Zhang, San, and Si Li. "A Survey on Artificial Intelligence." *Journal of Computers*, 2024. https://doi.org/...',
  },
  {
    value: 'Chicago',
    label: 'Chicago',
    desc: 'Chicago Manual of Style',
    example: 'Zhang, San, and Si Li. "A Survey on Artificial Intelligence." Journal of Computers (2024). https://doi.org/...',
  },
  {
    value: 'Vancouver',
    label: 'Vancouver',
    desc: '医学文献标准格式',
    example: '1. Zhang S, Li S. A survey on artificial intelligence. J Comput. 2024.',
  },
  {
    value: 'IEEE',
    label: 'IEEE',
    desc: '电气电子工程师学会',
    example: '[1] S. Zhang and S. Li, "A survey on artificial intelligence," J. Comput., 2024.',
  },
];

const selectedStyle = computed(() =>
  styles.find((s) => s.value === props.modelValue) || styles[0]
);

function selectStyle(value) {
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="citation-selector">
    <label class="selector-label">引用格式</label>
    <div class="style-options">
      <button
        v-for="style in styles"
        :key="style.value"
        class="style-option"
        :class="{ active: modelValue === style.value }"
        @click="selectStyle(style.value)"
        @mouseenter="hoveredStyle = style.value"
        @mouseleave="hoveredStyle = ''"
      >
        <span class="style-name">{{ style.label }}</span>
        <span class="style-desc">{{ style.desc }}</span>
      </button>
    </div>

    <div v-if="hoveredStyle || modelValue" class="example-preview">
      <div class="example-label">示例：</div>
      <div class="example-text">
        {{ (styles.find(s => s.value === (hoveredStyle || modelValue)) || selectedStyle).example }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.citation-selector {
  margin-top: 12px;
}

.selector-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary, #888);
  margin-bottom: 8px;
  font-weight: 500;
}

.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.style-option {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.style-option:hover {
  background: rgba(0, 112, 243, 0.08);
  border-color: rgba(0, 112, 243, 0.3);
}

.style-option.active {
  background: rgba(0, 112, 243, 0.12);
  border-color: var(--primary, #0070F3);
}

.style-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #f0f0f0);
}

.style-desc {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.example-preview {
  margin-top: 10px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 10px 12px;
}

.example-label {
  font-size: 11px;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}

.example-text {
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  line-height: 1.6;
  font-family: "Courier New", monospace;
  word-break: break-all;
}
</style>
