<template>
  <div @click.self="$emit('close')"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000">
    <div style="width:460px;max-height:90vh;overflow:auto;background:#fff;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:16px">🕐 调整交接班时间</h3>
        <span style="font-size:11px;color:#999">班次版本 v{{ baseVersion }}</span>
      </div>

      <div v-if="denyReason" :style="denyBoxStyle">
        <div style="font-weight:700;margin-bottom:4px">🔒 无权调整交接班</div>
        {{ denyReason }}
        <div style="margin-top:8px"><button @click="$emit('close')" :style="ghostBtnStyle">我知道了</button></div>
      </div>

      <template v-else>
        <div style="font-size:12px;color:#666;margin-bottom:10px;line-height:1.7">
          班次：{{ shift.name }}<br/>
          开班时间：{{ formatTime(shift.startedAt) }}<br/>
          当前计划交班：{{ formatTime(shift.plannedEndAt) }}
        </div>

        <label :style="labelStyle">新的计划交班时间</label>
        <input type="datetime-local" v-model="endAtLocal" :disabled="!duty.canManage" :style="inputStyle" />

        <ConflictDiff v-if="conflict"
          :message="conflict.message"
          :latest-version="conflict.current.version"
          :fields="conflictFields"
          @use-latest="useLatest"
          @keep-mine="keepMine"
          @close="conflict = null" />

        <div v-if="invalidMessage" :style="invalidBoxStyle">{{ invalidMessage }}</div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:8px;flex-wrap:wrap">
          <button @click="simulateExternal" :style="simBtnStyle"
            title="模拟另一位当班负责人在其他终端抢先调整了交班时间">
            🧪 模拟他人在其他终端抢先调整
          </button>
          <div style="display:flex;gap:8px">
            <button @click="$emit('close')" :style="ghostBtnStyle">取消</button>
            <button @click="handleSave" :style="primaryBtnStyle">保存调整</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDutyStore, toLocalInput, formatTime } from '../../stores/duty';
import ConflictDiff from './ConflictDiff.vue';
import type { Shift } from '../../types/duty';

const props = defineProps<{ shift: Shift }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const duty = useDutyStore();

const baseVersion = ref(props.shift.version);
const endAtLocal = ref(toLocalInput(props.shift.plannedEndAt));
const invalidMessage = ref('');
const denyReason = ref<string | null>(null);
const conflict = ref<{ message: string; current: Shift } | null>(null);
const attemptValue = ref<string>('');

function handleSave() {
  invalidMessage.value = '';
  if (!endAtLocal.value) {
    invalidMessage.value = '请选择交班时间。';
    return;
  }
  attemptValue.value = formatTime(endAtLocal.value);
  const res = duty.adjustShift(props.shift.id, new Date(endAtLocal.value).toISOString(), baseVersion.value);
  if (res.ok) {
    emit('saved');
    return;
  }
  if (res.code === 'forbidden') {
    denyReason.value = res.message;
    return;
  }
  if (res.code === 'invalid') {
    invalidMessage.value = res.message;
    return;
  }
  conflict.value = { message: res.message, current: res.current };
  duty.notify({ tone: 'conflict', text: res.message }, true);
}

const conflictFields = computed(() => {
  if (!conflict.value) return [];
  return [{
    label: '计划交班时间',
    base: formatTime(props.shift.plannedEndAt),
    current: formatTime(conflict.value.current.plannedEndAt),
    attempt: attemptValue.value,
  }];
});

function useLatest() {
  if (!conflict.value) return;
  endAtLocal.value = toLocalInput(conflict.value.current.plannedEndAt);
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

function simulateExternal() {
  const res = duty.simulateExternalShiftChange(props.shift.id);
  if (res.ok) {
    attemptValue.value = formatTime(endAtLocal.value);
    conflict.value = { message: '交接班时间刚被其他人调整，本次修改未保存。请查看差异后在最新时间上重试。', current: res.data };
    duty.notify({ tone: 'conflict', text: '检测到其他终端已抢先调整交班时间，请查看差异并重试。' }, true);
  }
}

const labelStyle = { display: 'block', fontSize: '12px', color: '#555', margin: '10px 0 4px' } as const;
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: '6px',
  border: '1px solid #ccc', fontSize: '13px', fontFamily: 'inherit',
} as const;
const primaryBtnStyle = {
  padding: '7px 16px', borderRadius: '6px', border: 'none',
  background: '#1b5e20', color: '#fff', cursor: 'pointer', fontSize: '13px',
};
const ghostBtnStyle = {
  padding: '7px 16px', borderRadius: '6px', border: '1px solid #ccc',
  background: '#fff', color: '#666', cursor: 'pointer', fontSize: '13px',
};
const simBtnStyle = {
  padding: '5px 10px', borderRadius: '6px', border: '1px dashed #ef6c00',
  background: '#fff8e1', color: '#e65100', cursor: 'pointer', fontSize: '11px',
};
const denyBoxStyle = {
  border: '1px solid #ffcdd2', background: '#ffebee', color: '#b71c1c',
  borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.6,
};
const invalidBoxStyle = {
  marginTop: '10px', border: '1px solid #ffcdd2', background: '#ffebee',
  color: '#c62828', borderRadius: '6px', padding: '8px 10px', fontSize: '12px',
};
</script>
