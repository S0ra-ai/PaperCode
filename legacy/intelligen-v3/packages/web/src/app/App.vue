<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppLayout from '@/shared/ui/AppLayout.vue';

const route = useRoute();
const isPublic = computed(() => route.meta?.public);
</script>

<template>
  <component :is="isPublic ? 'div' : AppLayout" class="app-root">
    <router-view />
  </component>
</template>
