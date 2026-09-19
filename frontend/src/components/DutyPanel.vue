<template>
  <div style="width:380px;padding:16px;overflow:auto;border-left:1px solid #e0e0e0;display:flex;flex-direction:column;height:100vh;box-sizing:border-box;background:#fafafa">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h3 style="margin:0;display:flex;align-items:center;gap:8px">🔄 值班与交接</h3>
      <span :style="roleBadgeStyle">{{ duty.roleLabel }}</span>
    </div>

    <!-- 角色切换（演示受控权限）：选择立即生效并持久化，退出重进仍保持 -->
    <div :style="roleCardStyle">
      <div style="font-size:11px;color:#888;margin-bottom:6px">当前身份（切换后值班入口与交接状态立即同步）</div>
      <div style="display:flex;gap:6px">
        <button v-for="r in roles" :key="r.value" @click="duty.setRole(r.value)"
          :style="roleBtnStyle(duty.currentRole === r.value, r.color)">
          {{ r.label }}
        </button>
      </div>
      <div style="font-size:11px;color:#666;margin-top:6px;line-height:1.5">{{ currentRoleHint }}</div>
    </div>

    <!-- 页面级反馈条：无权限原因 / 冲突提示 / 成功信息均在此说明，而不是按钮无反应 -->
    <div v-if="duty.feedback" :style="feedbackStyle">
      <span style="flex:1">{{ duty.feedback.text }}</span>
      <button @click="duty.clearFeedback()"
        style="border:none;background:transparent;cursor:pointer;color:inherit;font-size:14px;padding:0 0 0 8px">✕</button>
    </div>

    <template v-if="shift">
      <!-- 当班安排 -->
      <div :style="sectionCardStyle">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="fontSize:14px;font-weight:700">{{ shift.name }}</div>
          <span :style="statusPillStyle(shift.status)">{{ shiftStatusText(shift.status) }}</span>
        </div>
        <div style="font-size:12px;color:#555;line-height:1.9">
          当班负责人：<b>{{ duty.memberName(shift.leaderId) }}</b><br/>
          班组成员：{{ shift.memberIds.map(id => duty.memberName(id)).join('、') }}<br/>
          开班：{{ formatTime(shift.startedAt) }}<br/>
          计划交班：{{ formatTime(shift.plannedEndAt) }}<span v-if="shift.actualEndAt">
            （实际 {{ formatTime(shift.actualEndAt) }}）</span>
        </div>
        <button @click="openShiftDialog"
          :style="actionBtnStyle(!archived && duty.canManage, true)">
          🕐 调整交接班
        </button>
      </div>

      <!-- 交接记录状态 -->
      <div v-if="record" :style="sectionCardStyle">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="fontSize:13px;font-weight:700">📋 交接记录</div>
          <span :style="recordPillStyle(record.status)">{{ recordStatusText(record.status) }}</span>
        </div>
        <div style="font-size:12px;color:#555;line-height:1.7;margin-bottom:8px">
          <template v-if="record.summary">{{ record.summary }}</template>
          <template v-else style="color:#aaa">尚未填写交接说明</template>
          <div v-if="record.submittedAt" style="color:#888;margin-top:4px">提交于 {{ formatTime(record.submittedAt) }}</div>
          <div v-if="record.confirmedAt" style="color:#2e7d32">确认于 {{ formatTime(record.confirmedAt) }}</div>
        </div>
        <div v-if="!archived" style="display:flex;gap:6px">
          <button v-if="record.status === 'draft'" @click="openHandoverDialog('submit')"
            :style="actionBtnStyle(duty.canManage, true)">📤 提交交接</button>
          <button v-if="record.status === 'submitted'" @click="openHandoverDialog('confirm')"
            :style="actionBtnStyle(duty.canManage, false)">✅ 确认交接</button>
        </div>
      </div>

      <!-- 遗留事项 -->
      <div :style="sectionCardStyle">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="fontSize:13px;font-weight:700">
            📌 遗留事项
            <span v-if="duty.pendingConfirmCount > 0"
              style="font-size:11px;color:#e65100;font-weight:400;margin-left:4px">
              {{ duty.pendingConfirmCount }} 项待确认
            </span>
          </div>
          <button v-if="!archived" @click="openCreateDialog"
            :style="smallBtnStyle(duty.canManage)">➕ 新增</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <div v-for="it in duty.shiftItems(shift.id)" :key="it.id"
            :style="itemCardStyle(it.confirmed)">
            <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start">
              <div style="font-size:13px;font-weight:600;color:#333;flex:1">{{ it.title }}</div>
              <span :style="confirmPillStyle(it.confirmed)">{{ it.confirmed ? '已确认' : '待确认' }}</span>
            </div>
            <div style="font-size:12px;color:#666;margin:4px 0;white-space:pre-wrap;line-height:1.6">{{ it.detail }}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#888">
              <span>👤 {{ duty.memberName(it.assigneeId) }}</span>
              <span :style="statusTextStyle(it.status)">{{ itemStatusText(it.status) }}</span>
              <span>v{{ it.version }}</span>
              <span v-if="it.updatedBy">最后修改：{{ it.updatedBy }} {{ formatTime(it.updatedAt) }}</span>
            </div>
            <div v-if="!archived" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              <button @click="openEditDialog(it)"
                :style="smallBtnStyle(duty.canManage)">✏️ 修改</button>
              <button @click="openAssignDialog(it)"
                :style="smallBtnStyle(duty.canManage)"
                :title="it.assigneeId ? '重新分配处理人' : '分配处理人'">
                👤 {{ it.assigneeId ? '改派处理人' : '分配处理人' }}
              </button>
              <button v-if="!it.confirmed" @click="quickConfirm(it)"
                :style="smallBtnStyle(duty.canManage)">✅ 确认遗留</button>
            </div>
          </div>
          <div v-if="duty.shiftItems(shift.id).length === 0"
            style="text-align:center;color:#999;font-size:12px;padding:16px">暂无交接事项</div>
        </div>
      </div>
    </template>

    <!-- 历史交接记录：只读归档，任何角色都只能查看 -->
    <div v-if="duty.historyShifts.length > 0" :style="sectionCardStyle">
      <div style="fontSize:13px;font-weight:700;margin-bottom:8px">🗂️ 历史交接记录（只读）</div>
      <div v-for="hs in duty.historyShifts" :key="hs.id"
        style="border:1px solid #e0e0e0;border-radius:6px;padding:8px 10px;margin-bottom:6px;background:#fafafa">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#555">
          <span>{{ hs.name }}</span>
          <span style="color:#2e7d32">已归档</span>
        </div>
        <div style="font-size:11px;color:#888;margin-top:3px;line-height:1.6">
          负责人：{{ duty.memberName(hs.leaderId) }} ｜ {{ formatTime(hs.startedAt) }} ~ {{ formatTime(hs.actualEndAt) }}
        </div>
        <div v-if="duty.recordOf(hs.id)?.summary" style="font-size:11px;color:#666;margin-top:3px;line-height:1.6">
          {{ duty.recordOf(hs.id)?.summary }}
        </div>
        <div style="font-size:11px;color:#999;margin-top:3px">
          事项 {{ duty.shiftItems(hs.id).length }} 项，均已封存不可修改
        </div>
      </div>
    </div>

    <!-- 弹窗 -->
    <ItemDialog v-if="itemDialog !== 'closed'"
      :item="editingItem"
      @close="itemDialog = 'closed'"
      @saved="handleSaved" />
    <AssignDialog v-if="assignItem"
      :item="assignItem"
      @close="assignItem = null"
      @saved="handleSaved" />
    <ShiftDialog v-if="shiftDialogOpen && shift"
      :shift="shift"
      @close="shiftDialogOpen = false"
      @saved="handleSaved" />
    <HandoverDialog v-if="handoverDialog !== null && record"
      :record="record"
      :mode="handoverDialog"
      @close="handoverDialog = null"
      @saved="handleSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDutyStore, formatTime } from '../stores/duty';
import ItemDialog from './duty/ItemDialog.vue';
import AssignDialog from './duty/AssignDialog.vue';
import ShiftDialog from './duty/ShiftDialog.vue';
import HandoverDialog from './duty/HandoverDialog.vue';
import type { DutyRole, HandoverItem, HandoverItemStatus, Shift, HandoverRecord, ShiftStatus, DutyMutationResult } from '../types/duty';

type ActionResult =
  | DutyMutationResult<HandoverItem>
  | DutyMutationResult<Shift>
  | DutyMutationResult<HandoverRecord>;

const duty = useDutyStore();

const roles: Array<{ value: DutyRole; label: string; color: string }> = [
  { value: 'leader', label: '当班负责人', color: '#1b5e20' },
  { value: 'visitor', label: '访客', color: '#6a1b9a' },
  { value: 'admin', label: '管理员', color: '#0d47a1' },
];

const currentRoleHint = computed(() => {
  if (duty.currentRole === 'leader') return '可分配处理人、调整交接班、确认遗留事项与交接记录。';
  if (duty.currentRole === 'visitor') return '仅可查看当班安排与交接记录；任何写操作都会在此页面说明原因。';
  return '保留管理员原有全部能力，同时可管理值班模块；历史交接记录仍只读。';
});

const shift = computed(() => duty.currentShift);
const record = computed(() => duty.currentRecord);
const archived = computed(() => shift.value?.status === 'handed_over');

// ---- 弹窗状态 ----
const itemDialog = ref<'closed' | 'create' | 'edit'>('closed');
const editingItem = ref<HandoverItem | null>(null);
const assignItem = ref<HandoverItem | null>(null);
const shiftDialogOpen = ref(false);
const handoverDialog = ref<'submit' | 'confirm' | null>(null);

function openCreateDialog() {
  if (!guard('新增交接事项')) return;
  editingItem.value = null;
  itemDialog.value = 'create';
}
function openEditDialog(it: HandoverItem) {
  if (!guard('修改交接事项')) return;
  // 以当前最新版本作为乐观锁基线
  editingItem.value = duty.items.find(i => i.id === it.id) ?? it;
  itemDialog.value = 'edit';
}
function openShiftDialog() {
  if (!guard('调整交接班时间')) return;
  shiftDialogOpen.value = true;
}
function openHandoverDialog(mode: 'submit' | 'confirm') {
  if (!guard(mode === 'submit' ? '提交交接' : '确认交接')) return;
  handoverDialog.value = mode;
}

/**
 * 统一的页面内权限拦截：访客点击任何受控操作时，
 * 在面板顶部反馈条说明原因（按钮可点，但不会静默无反应）。
 */
function guard(action: string): boolean {
  if (!duty.canManage) {
    duty.notify({
      tone: 'deny',
      text: `无权限${action}。访客仅可查看当班安排与交接记录，请由当班负责人处理；可在顶部切换身份后重试。`,
    });
    return false;
  }
  return true;
}

function handleResult(res: ActionResult): boolean {
  if (res.ok) return true;
  if (res.code === 'forbidden' || res.code === 'invalid') {
    duty.notify({ tone: 'deny', text: res.message });
  } else {
    duty.notify({ tone: 'conflict', text: res.message }, true);
  }
  return false;
}

function openAssignDialog(it: HandoverItem) {
  if (!guard('分配处理人')) return;
  // 以当前最新版本作为乐观锁基线
  assignItem.value = duty.items.find(i => i.id === it.id) ?? it;
}

function quickConfirm(it: HandoverItem) {
  if (!guard('确认遗留事项')) return;
  const res = duty.saveItem(it.id, { confirmed: true }, it.version);
  if (!res.ok) handleResult(res);
}

function handleSaved() {
  itemDialog.value = 'closed';
  assignItem.value = null;
  shiftDialogOpen.value = false;
  handoverDialog.value = null;
  editingItem.value = null;
}

// ---- 文案与样式 ----
function shiftStatusText(s: ShiftStatus) {
  const map: Record<ShiftStatus, string> = { ongoing: '当班中', pending_handover: '待交接确认', handed_over: '已交接归档' };
  return map[s];
}
function itemStatusText(s: HandoverItemStatus) {
  const map: Record<HandoverItemStatus, string> = { pending: '待处理', in_progress: '处理中', done: '已完成' };
  return map[s];
}
function recordStatusText(s: 'draft' | 'submitted' | 'confirmed') {
  const map: Record<'draft' | 'submitted' | 'confirmed', string> = { draft: '草稿', submitted: '待确认', confirmed: '已确认' };
  return map[s];
}

const sectionCardStyle = {
  background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px',
  padding: '12px', marginBottom: '10px',
} as const;
const roleCardStyle = {
  background: '#fff', border: '1px solid #c8e6c9', borderRadius: '8px',
  padding: '10px', marginBottom: '10px',
} as const;
const roleBadgeStyle = {
  fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
  background: '#e8f5e9', color: '#1b5e20', fontWeight: 600,
} as const;
function roleBtnStyle(active: boolean, color: string) {
  return {
    flex: 1, padding: '6px 4px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
    border: active ? `1px solid ${color}` : '1px solid #ddd',
    background: active ? color : '#fff', color: active ? '#fff' : '#666', fontWeight: active ? 600 : 400,
  };
}
const feedbackTones: Record<string, { bg: string; color: string; border: string }> = {
  deny: { bg: '#ffebee', color: '#b71c1c', border: '#ef9a9a' },
  conflict: { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' },
  success: { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  info: { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
};
const feedbackStyle = computed(() => {
  const t = feedbackTones[duty.feedback?.tone ?? 'info'];
  return {
    display: 'flex', alignItems: 'center', fontSize: '12px', lineHeight: 1.6,
    background: t.bg, color: t.color, border: `1px solid ${t.border}`,
    borderRadius: '8px', padding: '8px 10px', marginBottom: '10px',
  };
});
function statusPillStyle(s: ShiftStatus) {
  const map: Record<ShiftStatus, { bg: string; color: string }> = {
    ongoing: { bg: '#e8f5e9', color: '#2e7d32' },
    pending_handover: { bg: '#fff3e0', color: '#e65100' },
    handed_over: { bg: '#eceff1', color: '#546e7a' },
  };
  return { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, ...map[s] };
}
function recordPillStyle(s: 'draft' | 'submitted' | 'confirmed') {
  const map = {
    draft: { bg: '#f5f5f5', color: '#757575' },
    submitted: { bg: '#fff3e0', color: '#e65100' },
    confirmed: { bg: '#e8f5e9', color: '#2e7d32' },
  } as const;
  return { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, ...map[s] };
}
function confirmPillStyle(confirmed: boolean) {
  return {
    fontSize: '10px', padding: '1px 7px', borderRadius: '9px', whiteSpace: 'nowrap',
    background: confirmed ? '#e8f5e9' : '#fff3e0', color: confirmed ? '#2e7d32' : '#e65100',
  };
}
function itemCardStyle(confirmed: boolean) {
  return {
    border: '1px solid ' + (confirmed ? '#e0e0e0' : '#ffcc80'),
    borderRadius: '8px', padding: '10px',
    background: confirmed ? '#fafafa' : '#fffdf7',
  };
}
function statusTextStyle(s: HandoverItemStatus) {
  const colorMap: Record<HandoverItemStatus, string> = { pending: '#999', in_progress: '#1565c0', done: '#2e7d32' };
  return { color: colorMap[s], fontWeight: 600 };
}
function actionBtnStyle(enabled: boolean, primary: boolean) {
  return {
    marginTop: '8px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
    border: enabled
      ? (primary ? 'none' : '1px solid #1b5e20')
      : '1px solid #e0e0e0',
    background: enabled ? (primary ? '#1b5e20' : '#e8f5e9') : '#f5f5f5',
    color: enabled ? (primary ? '#fff' : '#1b5e20') : '#9e9e9e',
  };
}
function smallBtnStyle(enabled: boolean) {
  return {
    padding: '3px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
    border: enabled ? '1px solid #1b5e20' : '1px solid #e0e0e0',
    background: enabled ? '#f1f8e9' : '#f5f5f5',
    color: enabled ? '#1b5e20' : '#9e9e9e',
  };
}
</script>
