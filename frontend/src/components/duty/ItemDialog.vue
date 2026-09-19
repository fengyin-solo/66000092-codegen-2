<template>
  <div @click.self="$emit('close')"
    style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000">
    <div style="width:520px;max-height:90vh;overflow:auto;background:#fff;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:16px">
          {{ isCreate ? '➕ 新增交接事项' : '✏️ 编辑交接事项' }}
        </h3>
        <span v-if="!isCreate" style="font-size:11px;color:#999">版本 v{{ baseVersion }}</span>
      </div>

      <!-- 无权限：在当前对话框（当前页面）说明原因，而不是无反应 -->
      <div v-if="denyReason" :style="denyBoxStyle">
        <div style="font-weight:700;margin-bottom:4px">🔒 无权进行该操作</div>
        {{ denyReason }}
        <div style="margin-top:8px;display:flex;gap:8px">
          <button @click="$emit('close')" :style="ghostBtnStyle">我知道了</button>
        </div>
      </div>

      <template v-else>
        <label :style="labelStyle">事项标题</label>
        <input v-model="form.title" :disabled="!editable" type="text" :style="inputStyle" placeholder="例如：设备低电量更换电池" />

        <label :style="labelStyle">详细说明</label>
        <textarea v-model="form.detail" :disabled="!editable" :style="{ ...inputStyle, height:'80px', resize:'vertical' }" />

        <label :style="labelStyle">处理人（当班负责人分配）</label>
        <select v-model="form.assigneeId" :disabled="!editable" :style="inputStyle">
          <option :value="null">未分配</option>
          <option v-for="m in duty.members" :key="m.id" :value="m.id">{{ m.name }}（{{ m.position }}）</option>
        </select>

        <label :style="labelStyle">处理状态</label>
        <select v-model="form.status" :disabled="!editable" :style="inputStyle">
          <option value="pending">待处理</option>
          <option value="in_progress">处理中</option>
          <option value="done">已完成</option>
        </select>

        <label v-if="!isCreate"
          :style="{ ...labelStyle, display:'flex', alignItems:'center', gap:'6px', cursor: editable ? 'pointer' : 'not-allowed' }">
          <input type="checkbox" v-model="form.confirmed" :disabled="!editable" style="margin:0" />
          当班负责人已确认该遗留事项
        </label>

        <!-- 冲突：三方差异 + 重试 -->
        <ConflictDiff v-if="conflict"
          :message="conflict.message"
          :latest-version="conflict.current.version"
          :fields="conflictFields"
          @use-latest="useLatest"
          @keep-mine="keepMine"
          @close="conflict = null" />

        <div v-if="invalidMessage" :style="invalidBoxStyle">{{ invalidMessage }}</div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:8px;flex-wrap:wrap">
          <!-- 并发演示：模拟另一位同事在其他终端抢先保存 -->
          <button v-if="!isCreate" @click="simulateExternal" :style="simBtnStyle"
            title="模拟另一位同事在其他终端抢先修改并保存（也可以直接打开两个浏览器标签页操作）">
            🧪 模拟他人在其他终端抢先保存
          </button>
          <span v-else></span>
          <div style="display:flex;gap:8px">
            <button @click="$emit('close')" :style="ghostBtnStyle">取消</button>
            <button @click="handleSave" :style="primaryBtnStyle">
              {{ isCreate ? '新增' : (form.confirmed && !originalConfirmed ? '保存修改并确认' : '保存') }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useDutyStore } from '../../stores/duty';
import ConflictDiff from './ConflictDiff.vue';
import type { HandoverItem, HandoverItemPatch } from '../../types/duty';

const props = defineProps<{
  item: HandoverItem | null; // null = 新增
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const duty = useDutyStore();

const isCreate = computed(() => props.item === null);
const editable = computed(() => duty.canManage);
const denyReason = ref<string | null>(null);

const statusText = (s: HandoverItem['status']) =>
  ({ pending: '待处理', in_progress: '处理中', done: '已完成' })[s];

const original = props.item;
const baseVersion = ref(original?.version ?? 0);
const originalConfirmed = original?.confirmed ?? false;

const form = reactive({
  title: original?.title ?? '',
  detail: original?.detail ?? '',
  assigneeId: original?.assigneeId ?? (null as string | null),
  status: original?.status ?? 'pending',
  confirmed: original?.confirmed ?? false,
});

const invalidMessage = ref('');
const conflict = ref<{ message: string; current: HandoverItem } | null>(null);
// 冲突发生时尝试保存的内容（用于三方差异中的"你尝试保存"一列）
const attemptSnapshot = ref<HandoverItemPatch | null>(null);

function buildPatch(): HandoverItemPatch {
  return {
    title: form.title,
    detail: form.detail,
    assigneeId: form.assigneeId,
    status: form.status,
    confirmed: form.confirmed,
  };
}

function handleSave() {
  invalidMessage.value = '';
  if (!form.title.trim()) {
    invalidMessage.value = '事项标题不能为空。';
    return;
  }

  if (isCreate.value) {
    const res = duty.addItem({ title: form.title, detail: form.detail, assigneeId: form.assigneeId });
    if (!res.ok && res.code === 'forbidden') {
      denyReason.value = res.message;
      return;
    }
    if (!res.ok && res.code === 'invalid') {
      invalidMessage.value = res.message;
      return;
    }
    emit('saved');
    return;
  }

  const patch = buildPatch();
  attemptSnapshot.value = patch;
  const res = duty.saveItem(original!.id, patch, baseVersion.value);
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
  // conflict
  conflict.value = { message: res.message, current: res.current };
  duty.notify({ tone: 'conflict', text: res.message }, true);
}

const conflictFields = computed(() => {
  if (!conflict.value || !original || !attemptSnapshot.value) return [];
  const cur = conflict.value.current;
  const att = attemptSnapshot.value;
  return [
    { label: '标题', base: original.title, current: cur.title, attempt: att.title ?? '' },
    { label: '详细说明', base: original.detail, current: cur.detail, attempt: att.detail ?? '' },
    {
      label: '处理人',
      base: duty.memberName(original.assigneeId),
      current: duty.memberName(cur.assigneeId),
      attempt: duty.memberName(att.assigneeId ?? null),
    },
    {
      label: '处理状态',
      base: statusText(original.status),
      current: statusText(cur.status),
      attempt: statusText(att.status ?? cur.status),
    },
    {
      label: '确认状态',
      base: original.confirmed ? '已确认' : '未确认',
      current: cur.confirmed ? '已确认' : '未确认',
      attempt: att.confirmed ? '已确认' : '未确认',
    },
  ];
});

/** 放弃本地修改，表单载入最新版本（冲突解决后重试） */
function useLatest() {
  if (!conflict.value) return;
  const cur = conflict.value.current;
  form.title = cur.title;
  form.detail = cur.detail;
  form.assigneeId = cur.assigneeId;
  form.status = cur.status;
  form.confirmed = cur.confirmed;
  baseVersion.value = cur.version;
  conflict.value = null;
  duty.clearFeedback();
}

/**
 * 保留我填写的内容：仅把版本基线推进到最新（对方的差异已在上方可见），
 * 内容仍保持我的版本，用户再次点击保存即完成"在最新版本上重试"。
 */
function keepMine() {
  if (!conflict.value) return;
  baseVersion.value = conflict.value.current.version;
  conflict.value = null;
  duty.clearFeedback();
}

/** 并发演示入口：制造一个外部修改并提升版本，使下一次保存必定冲突 */
function simulateExternal() {
  if (!original) return;
  const res = duty.simulateExternalItemChange(original.id);
  if (res.ok) {
    invalidMessage.value = '';
    // 立即用差异视图展示冲突，效果与其他终端真实抢先保存一致
    conflict.value = { message: '该交接事项在你编辑期间已被其他人保存，本次修改未写入。请对比差异并在最新内容上重试。', current: res.data };
    attemptSnapshot.value = buildPatch();
    duty.notify({ tone: 'conflict', text: '检测到其他终端已抢先保存该事项，请查看差异并重试。' }, true);
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
