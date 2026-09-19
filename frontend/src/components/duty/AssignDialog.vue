<template>
  <div @click.self="$emit('close')"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000">
    <div style="width:440px;max-height:90vh;overflow:auto;background:#fff;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:16px">👤 分配处理人</h3>
        <span style="font-size:11px;color:#999">事项版本 v{{ baseVersion }}</span>
      </div>

      <div v-if="denyReason" :style="denyBoxStyle">
        <div style="font-weight:700;margin-bottom:4px">🔒 无权分配处理人</div>
        {{ denyReason }}
        <div style="margin-top:8px"><button @click="$emit('close')" :style="ghostBtnStyle">我知道了</button></div>
      </div>

      <template v-else>
        <div style="font-size:13px;color:#333;font-weight:600;margin-bottom:4px">{{ item.title }}</div>
        <div style="font-size:12px;color:#888;margin-bottom:12px">
          当前处理人：{{ duty.memberName(item.assigneeId) }}
        </div>

        <label :style="labelStyle">选择处理人</label>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label v-for="m in duty.members" :key="m.id"
            :style="memberOptionStyle(assigneeId === m.id)"
            @click="assigneeId = m.id">
            <input type="radio" name="assignee" :checked="assigneeId === m.id"
              @change="assigneeId = m.id" style="margin:0" />
            <span style="font-size:13px;font-weight:600">{{ m.name }}</span>
            <span style="font-size:11px;color:#888">{{ m.position }}</span>
          </label>
          <label :style="memberOptionStyle(assigneeId === null)" @click="assigneeId = null">
            <input type="radio" name="assignee" :checked="assigneeId === null"
              @change="assigneeId = null" style="margin:0" />
            <span style="font-size:13px">暂不分配</span>
          </label>
        </div>

        <ConflictDiff v-if="conflict"
          :message="conflict.message"
          :latest-version="conflict.current.version"
          :fields="conflictFields"
          @use-latest="useLatest"
          @keep-mine="keepMine"
          @close="conflict = null" />

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button @click="$emit('close')" :style="ghostBtnStyle">取消</button>
          <button @click="handleSave" :style="primaryBtnStyle">保存分配</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDutyStore } from '../../stores/duty';
import ConflictDiff from './ConflictDiff.vue';
import type { HandoverItem } from '../../types/duty';

const props = defineProps<{ item: HandoverItem }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const duty = useDutyStore();

const baseVersion = ref(props.item.version);
const assigneeId = ref<string | null>(props.item.assigneeId);
const denyReason = ref<string | null>(null);
const conflict = ref<{ message: string; current: HandoverItem } | null>(null);
const attemptAssignee = ref<string | null>(props.item.assigneeId);

function handleSave() {
  attemptAssignee.value = assigneeId.value;
  const res = duty.assignAssignee(props.item.id, assigneeId.value, baseVersion.value);
  if (res.ok) { emit('saved'); return; }
  if (res.code === 'forbidden') { denyReason.value = res.message; return; }
  if (res.code === 'invalid') {
    duty.notify({ tone: 'deny', text: res.message });
    return;
  }
  conflict.value = { message: res.message, current: res.current };
  duty.notify({ tone: 'conflict', text: res.message }, true);
}

const conflictFields = computed(() => {
  if (!conflict.value) return [];
  return [{
    label: '处理人',
    base: duty.memberName(props.item.assigneeId),
    current: duty.memberName(conflict.value.current.assigneeId),
    attempt: duty.memberName(attemptAssignee.value),
  }];
});

function useLatest() {
  if (!conflict.value) return;
  assigneeId.value = conflict.value.current.assigneeId;
  baseVersion.value = conflict.value.current.version;
  conflict.value = null;
  duty.clearFeedback();
}

function keepMine() {
  if (!conflict.value) return;
  baseVersion.value = conflict.value.current.version;
  conflict.value = null;
  duty.clearFeedback();
}

const labelStyle = { display: 'block', fontSize: '12px', color: '#555', margin: '10px 0 6px' } as const;
function memberOptionStyle(active: boolean) {
  return {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
    borderRadius: '6px', border: '1px solid ' + (active ? '#1b5e20' : '#e0e0e0'),
    background: active ? '#f1f8e9' : '#fff', cursor: 'pointer',
  };
}
const primaryBtnStyle = {
  padding: '7px 16px', borderRadius: '6px', border: 'none',
  background: '#1b5e20', color: '#fff', cursor: 'pointer', fontSize: '13px',
};
const ghostBtnStyle = {
  padding: '7px 16px', borderRadius: '6px', border: '1px solid #ccc',
  background: '#fff', color: '#666', cursor: 'pointer', fontSize: '13px',
};
const denyBoxStyle = {
  border: '1px solid #ffcdd2', background: '#ffebee', color: '#b71c1c',
  borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.6,
};
</script>
