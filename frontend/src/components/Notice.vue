<template>
  <div v-if="notice" :style="{
    marginTop: '7px', padding: '6px 9px', borderRadius: '6px', fontSize: '11px', lineHeight: 1.5,
    background: notice.type === 'error' ? '#fdecea' : '#e8f5e9',
    color: notice.type === 'error' ? '#b71c1c' : '#2e7d32',
    border: '1px solid ' + (notice.type === 'error' ? '#f5c6c2' : '#a5d6a7'),
  }">
    {{ notice.type === 'error' ? '⛔ ' : '✅ ' }}{{ notice.text }}
  </div>
</template>

<script setup lang="ts">
interface NoticeData { type: 'error' | 'success'; text: string }
defineProps<{ notice: NoticeData | null | undefined }>();
</script>
