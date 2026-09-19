<template>
  <div
    style="position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000"
    @click.self="handleClose"
  >
    <div
      style="width:560px;max-width:92vw;max-height:86vh;overflow:auto;background:#fff;border-radius:12px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,0.25)"
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:20px">⚠️</span>
        <h3 style="margin:0;font-size:16px;color:#c62828">保存冲突：该交接事项已被他人更新</h3>
      </div>
      <p style="margin:0 0 12px;font-size:13px;color:#666;line-height:1.6">
        {{ store.activeConflict!.conflict.message }}
      </p>

      <div style="display:flex;gap:8px;font-size:12px;color:#888;margin-bottom:4px">
        <span style="flex:1;font-weight:600;color:#1565c0">我的提交（基于旧版本 v{{ attemptedVersion }}）</span>
        <span style="flex:1;font-weight:600;color:#2e7d32">服务器最新版本 v{{ serverVersion }} · {{ updaterName }}</span>
      </div>

      <div style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:12px">
        <div v-if="diffs.length === 0" style="padding:12px;font-size:13px;color:#888">
          字段内容已一致，可直接重试保存。
        </div>
        <div
          v-for="d in diffs" :key="d.field"
          style="display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px"
        >
          <div style="flex:1">
            <div style="fontSize:11px;color:#999;marginBottom:3px">{{ d.label }}</div>
            <div style="color:#1565c0;background:#e3f2fd;borderRadius:4px;padding:4px 8px;min-height:20px;wordBreak:break-all">
              {{ d.yours }}
            </div>
          </div>
          <div style="flex:1">
            <div style="fontSize:11px;color:#999;marginBottom:3px">{{ d.label }}</div>
            <div style="color:#2e7d32;background:#e8f5e9;borderRadius:4px;padding:4px 8px;min-height:20px;wordBreak:break-all">
              {{ d.theirs }}
            </div>
          </div>
        </div>
      </div>

      <div style="font-size:12px;color:#999;margin-bottom:14px;line-height:1.6">
        「重试保存」会以您的内容覆盖最新版本；「采用最新版本」会放弃您的修改并刷新查看。
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button
          @click="handleClose"
          style="padding:7px 16px;borderRadius:6px;border:1px solid #ccc;background:#fff;color:#666;cursor:pointer;fontSize:13px"
        >
          稍后处理
        </button>
        <button
          @click="handleAdopt"
          style="padding:7px 16px;borderRadius:6px;border:1px solid #2e7d32;background:#fff;color:#2e7d32;cursor:pointer;fontSize:13px"
        >
          采用最新版本
        </button>
        <button
          @click="handleRetry"
          style="padding:7px 16px;borderRadius:6px;border:none;background:#1565c0;color:#fff;cursor:pointer;fontSize:13px;fontWeight:600"
        >
          用我的修改重试
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDutyStore } from '../stores/duty';

const store = useDutyStore();

const diffs = computed(() => store.activeConflict?.conflict.diffs ?? []);
const server = computed(() => store.activeConflict?.conflict.server as { version: number; updatedBy?: string } | undefined);
const serverVersion = computed(() => server.value?.version ?? 1);
const attemptedVersion = computed(() => {
  const v = store.activeConflict?.conflict.attempted.version;
  return typeof v === 'number' ? v : '?';
});
const updaterName = computed(() =>
  server.value?.updatedBy ? store.userName(server.value.updatedBy) : '其他人');

function handleRetry() {
  store.retryConflict();
}

function handleAdopt() {
  store.adoptServerVersion();
}

function handleClose() {
  store.activeConflict = null;
}
</script>
