<template>
  <div @click.self="$emit('close')"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000">
    <div style="width:520px;max-height:90vh;overflow:auto;background:#fff;border-radius:10px;padding:20px">
      <h3 style="margin:0 0 14px;font-size:16px">
        {{ mode === 'submit' ? '📋 提交交接班记录' : '✅ 确认交接班记录' }}
        <span style="font-size:11px;color:#997;font-weight:400;margin-left:8px">记录版本 v{{ baseVersion }}</span>
      </h3>

      <div v-if="denyReason" :style="denyBoxStyle">
        <div style="font-weight:700;margin-bottom:4px">🔒 无权进行该操作</div>
        {{ denyReason }}
        <div style="margin-top:8px"><button @click="$emit('close')" :style="ghostBtnStyle">我知道了</button></div>
      </div>

      <template v-else>
        <div v-if="mode === 'confirm'" style="font-size:13px;color:#555;line-height:1.7;margin-bottom:10px">
          交接记录已于 {{ formatTime(record.submittedAt) }} 提交。请核对遗留事项清单与交接说明，
          确认后本班次将归档为只读历史记录。
        </div>

        <div style="font-size:12px;color:#888;margin-bottom:4px">
          未确认遗留事项：<b :style="{ color: unconfirmed.length > 0 ? '#c62828' : '#2e7d32' }">{{ unconfirmed.length }}</b> 项
        </div>
        <div v-if="unconfirmed.length > 0" style="margin-bottom:10px;display:flex;flex-direction:column;gap:4px">
          <div v-for="it in unconfirmed" :key="it.id"
            style="font-size:12px;color:#c62828;background:#ffebee;border:1px solid #ffcdd2;border-radius:6px;padding:5px 8px">
            • {{ it.title }}
          </div>
        </div>

        <label :style="labelStyle">交接说明</label>
        <textarea v-model="summary" :disabled="mode === 'confirm' || !duty.canManage"
          :style="{ ...inputStyle, height:'120px', resize:'vertical' }"
          placeholder="本班运行情况、遗留问题、注意事项…"></textarea>

        <ConflictDiff v-if="conflict"
          message="交接记录在你编辑期间已被其他人保存，本次操作未生效。"
          :latest-version="conflict.version"
          :fields="conflictFields"
          @use-latest="useLatest"
          @keep-mine="keepMine"
          @close="conflict = null" />

        <div v-if="invalidMessage" :style="invalidBoxStyle">{{ invalidMessage }}</div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button @click="$emit('close')" :style="ghostBtnStyle">取消</button>
          <button v-if="mode === 'submit'" @click="handleSubmit" :style="primaryBtnStyle">提交交接</button>
          <button v-else @click="handleConfirm" :style="primaryBtnStyle">确认交接并归档</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDutyStore, formatTime } from '../../stores/duty';
import ConflictDiff from './ConflictDiff.vue';
import type { HandoverRecord } from '../../types/duty';

const props = defineProps<{
  record: HandoverRecord;
  mode: 'submit' | 'confirm';
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const duty = useDutyStore();

const baseVersion = ref(props.record.version);
const originalSummary = props.record.summary;
const summary = ref(props.record.summary);
const invalidMessage = ref('');
const denyReason = ref<string | null>(null);
const conflict = ref<HandoverRecord | null>(null);
const attemptSummary = ref('');

const unconfirmed = computed(() =>
  duty.shiftItems(props.record.shiftId).filter(i => !i.confirmed),
);

function handleConflict(res: Extract<ReturnType<typeof duty.submitHandover>, { ok: false; code: 'conflict' }>
  | Extract<ReturnType<typeof duty.confirmHandover>, { ok: false; code: 'conflict' }>) {
  conflict.value = res.current;
  attemptSummary.value = summary.value;
  duty.notify({ tone: 'conflict', text: res.message }, true);
}

function handleSubmit() {
  invalidMessage.value = '';
  const res = duty.submitHandover(props.record.shiftId, summary.value, baseVersion.value);
  if (res.ok) { emit('saved'); return; }
  if (res.code === 'forbidden') { denyReason.value = res.message; return; }
  if (res.code === 'invalid') { invalidMessage.value = res.message; return; }
  handleConflict(res);
}

function handleConfirm() {
  invalidMessage.value = '';
  const res = duty.confirmHandover(props.record.shiftId, baseVersion.value);
  if (res.ok) { emit('saved'); return; }
  if (res.code === 'forbidden') { denyReason.value = res.message; return; }
  if (res.code === 'invalid') { invalidMessage.value = res.message; return; }
  handleConflict(res);
}

const conflictFields = computed(() => {
  if (!conflict.value) return [];
  return [{
    label: '交接说明',
    base: originalSummary,
    current: conflict.value.summary,
    attempt: attemptSummary.value,
  }];
});

function useLatest() {
  if (!conflict.value) return;
  summary.value = conflict.value.summary;
  baseVersion.value = conflict.value.version;
  conflict.value = null;
  duty.clearFeedback();
}

function keepMine() {
  if (!conflict.value) return;
  baseVersion.value = conflict.value.version;
  conflict.value = null;
  duty.clearFeedback();
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
const denyBoxStyle = {
  border: '1px solid #ffcdd2', background: '#ffebee', color: '#b71c1c',
  borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.6,
};
const invalidBoxStyle = {
  marginTop: '10px', border: '1px solid #ffcdd2', background: '#ffebee',
  color: '#c62828', borderRadius: '6px', padding: '8px 10px', fontSize: '12px',
};
</script>
