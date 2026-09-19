<template>
  <div style="width:400px;padding:16px;overflow:auto;border-left:1px solid #e0e0e0;display:flex;flex-direction:column;gap:14px;height:100vh;box-sizing:border-box;background:#fafafa">
    <!-- 标题 -->
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h3 style="margin:0;display:flex;align-items:center;gap:8px">🧑‍✈️ 值班与交接</h3>
      <span v-if="store.ongoingShift"
        :style="{ padding:'2px 10px', borderRadius:'10px', fontSize:'12px', fontWeight:600,
          background: store.ongoingShift.status === 'ongoing' ? '#e8f5e9' : '#eee',
          color: store.ongoingShift.status === 'ongoing' ? '#2e7d32' : '#777' }">
        {{ store.ongoingShift.status === 'ongoing' ? '当班进行中' : '已结束' }}
      </span>
    </div>

    <!-- 身份切换 -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">
      <div style="fontSize:12px;fontWeight:600;color:#333;marginBottom:8px">当前值班身份</div>
      <select
        :value="store.currentUserId"
        @change="onSwitchUser(($event.target as HTMLSelectElement).value)"
        style="width:100%;padding:7px 8px;border:1px solid #ccc;borderRadius:6px;fontSize:13px;background:#fff"
      >
        <option v-for="u in dutyUsers" :key="u.id" :value="u.id">
          {{ u.name }}（{{ ROLE_LABELS[u.role] }}）
        </option>
      </select>
      <div style="marginTop:8px;padding:7px 9px;borderRadius:6px;background:#f1f8e9;fontSize:11px;color:#555;lineHeight:1.6">
        <span :style="{ fontWeight:700, color: roleColor(store.currentRole) }">{{ store.roleLabel }}</span>
        ：{{ ROLE_HINTS[store.currentRole] }}
      </div>
      <div v-if="!store.canManage"
        style="marginTop:8px;padding:7px 9px;borderRadius:6px;background:#fff8e1;border:1px solid #ffe082;fontSize:11px;color:#8d6e00;lineHeight:1.6">
        🔒 当前角色为只读视角：可查看下方全部当班安排与交接记录；执行修改时会在此处说明无权限原因。
      </div>
    </div>

    <!-- 当班安排 -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="fontSize:13px;fontWeight:600;color:#333">🕒 当班安排 · {{ store.ongoingShift?.name }}</div>
        <div style="fontSize:11px;color:#888">当班负责人：{{ store.userName(store.ongoingShift?.leaderId ?? null) }}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;marginBottom:8px">
        <input type="datetime-local" v-model="shiftStartDraft" @input="markShiftDirty" :disabled="!store.canManage"
          style="flex:1;padding:6px 8px;border:1px solid #ccc;borderRadius:6px;fontSize:12px" />
        <span style="color:#999">至</span>
        <input type="datetime-local" v-model="shiftEndDraft" @input="markShiftDirty" :disabled="!store.canManage"
          style="flex:1;padding:6px 8px;border:1px solid #ccc;borderRadius:6px;fontSize:12px" />
      </div>
      <button @click="saveShift"
        :style="store.canManage ? actionBtnStyle : readonlyBtnStyle">
        💾 调整交接班时间
      </button>
      <Notice :notice="shiftNotice" />
    </div>

    <!-- 处理人分配 -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">
      <div style="fontSize:13px;fontWeight:600;color:#333;marginBottom:10px">
        👷 当班事项与处理人（{{ store.ongoingItems.length }}）
      </div>
      <div v-if="store.ongoingItems.length === 0" style="fontSize:12px;color:#999">暂无当班事项</div>
      <div v-for="item in store.ongoingItems" :key="item.id"
        style="border:1px solid #f0f0f0;borderRadius:8px;padding:9px;marginBottom:8px">
        <div style="fontSize:13px;fontWeight:600;color:#333">{{ item.title }}</div>
        <div style="fontSize:11px;color:#888;margin:3px 0 8px;lineHeight:1.5">{{ item.detail }}</div>
        <div style="display:flex;gap:6px;marginBottom:8px">
          <select v-model="itemDrafts[item.id].assigneeId" @change="markItemDirty(item.id)" :disabled="!store.canManage"
            style="flex:1;padding:5px 6px;border:1px solid #ccc;borderRadius:5px;fontSize:12px;background:#fff">
            <option value="">未分配</option>
            <option v-for="u in assignableUsers" :key="u.id" :value="u.id">
              {{ u.name }}（{{ ROLE_LABELS[u.role] }}）
            </option>
          </select>
          <select v-model="itemDrafts[item.id].status" @change="markItemDirty(item.id)" :disabled="!store.canManage"
            style="width:92px;padding:5px 6px;border:1px solid #ccc;borderRadius:5px;fontSize:12px;background:#fff">
            <option value="pending">待处理</option>
            <option value="in_progress">处理中</option>
            <option value="done">已完成</option>
          </select>
        </div>
        <button @click="saveItem(item.id)" :style="store.canManage ? actionBtnStyle : readonlyBtnStyle">💾 分配 / 更新处理人</button>
        <Notice :notice="itemNotices[item.id]" />
      </div>
    </div>

    <!-- 交接记录（当班） -->
    <div v-if="store.ongoingHandover" style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="fontSize:13px;fontWeight:600;color:#333">📋 交接记录 · 来自「{{ store.ongoingHandover.fromShiftName }}」</div>
        <span :style="{ padding:'2px 8px', borderRadius:'9px', fontSize:'11px', fontWeight:600,
          background: handoverBadge.bg, color: handoverBadge.color }">
          {{ handoverBadge.text }}
        </span>
      </div>
      <div style="fontSize:11px;color:#999;marginBottom:8px">
        交接时间：{{ formatTime(store.ongoingHandover.handoverTime) }}
      </div>
      <textarea v-model="summaryDraft" rows="3" @input="markSummaryDirty" :disabled="!store.canManage"
        placeholder="交接说明"
        style="width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #ccc;borderRadius:6px;fontSize:12px;resize:vertical;fontFamily:inherit" />
      <div style="display:flex;gap:8px;marginTop:8px">
        <button @click="saveSummary" :style="store.canManage ? actionBtnStyle : readonlyBtnStyle">💾 保存交接说明</button>
        <button v-if="store.ongoingHandover.status === 'pending'" @click="completeHandover"
          :style="store.canManage
            ? { padding:'6px 12px', borderRadius:'6px', border:'none', background:'#2e7d32', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:600 }
            : readonlyBtnStyle">
          ✅ 完成交接
        </button>
      </div>
      <Notice :notice="handoverNotice" />

      <!-- 遗留事项 -->
      <div style="marginTop:12px">
        <div style="fontSize:12px;fontWeight:600;color:#333;marginBottom:6px">
          🔎 遗留事项（待确认 {{ pendingCarryovers.length }} 项）
        </div>
        <div v-if="store.ongoingHandover.carryovers.length === 0" style="fontSize:12px;color:#999">无遗留事项</div>
        <div v-for="c in store.ongoingHandover.carryovers" :key="c.id"
          style="border:1px solid #f0f0f0;borderRadius:8px;padding:9px;marginBottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="fontSize:13px;fontWeight:600;color:#333">{{ c.title }}</span>
            <span :style="{ fontSize:'11px', fontWeight:600,
              color: c.status === 'pending' ? '#e65100' : '#2e7d32' }">
              {{ c.status === 'pending' ? '待确认闭环' : `已由${store.userName(c.confirmedBy)}确认` }}
            </span>
          </div>
          <div style="fontSize:11px;color:#888;margin:3px 0 8px;lineHeight:1.5">{{ c.detail }}</div>
          <button v-if="c.status === 'pending'" @click="confirmCarryover(c)"
            :style="store.canManage ? actionBtnStyle : readonlyBtnStyle">
            ✔ 确认遗留事项已闭环
          </button>
          <button v-else-if="store.canManage" @click="reopenCarryover(c)"
            :style="{ padding:'5px 10px', borderRadius:'6px', border:'1px solid #999',
              background:'#fff', color:'#666', cursor:'pointer', fontSize:'12px' }">
            ↩ 重新标记为待确认
          </button>
          <Notice :notice="carryNotices[c.id]" />
        </div>
      </div>
    </div>

    <!-- 历史交接 -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">
      <div style="fontSize:13px;fontWeight:600;color:#333;marginBottom:8px">📚 历史交接记录（只读）</div>
      <div v-if="store.historyHandovers.length === 0" style="fontSize:12px;color:#999">暂无历史记录</div>
      <div v-for="h in store.historyHandovers" :key="h.id"
        style="border:1px solid #f0f0f0;borderRadius:8px;padding:9px;marginBottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="fontSize:12px;fontWeight:600;color:#333">
            {{ store.shiftName(h.shiftId) }} · 来自「{{ h.fromShiftName }}」
          </span>
          <span style="fontSize:11px;color:h.status === 'completed' ? '#2e7d32' : '#e65100'">
            {{ h.status === 'completed' ? '交接完成' : '待确认' }}
          </span>
        </div>
        <div style="fontSize:11px;color:#888;margin:3px 0">{{ formatTime(h.handoverTime) }}</div>
        <div style="fontSize:12px;color:#555;lineHeight:1.5">{{ h.summary }}</div>
        <div v-if="h.carryovers.length" style="marginTop:5px;fontSize:11px;color:#999">
          遗留 {{ h.carryovers.length }} 项 ·
          已闭环 {{ h.carryovers.filter(c => c.status === 'resolved').length }} 项
        </div>
      </div>
    </div>

    <ConflictDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useDutyStore } from '../stores/duty';
import { dutyService, ROLE_LABELS, ROLE_HINTS } from '../services/dutyService';
import ConflictDialog from './ConflictDialog.vue';
import Notice from './Notice.vue';
import type { DutyRole, DutyResult, DutyItemStatus, CarryoverItem } from '../types';

const store = useDutyStore();
store.init();
// init 幂等；App 挂载时已初始化，此处保证面板单独打开时也就绪

const dutyUsers = dutyService.users;
const assignableUsers = dutyUsers.filter(u => u.role !== 'visitor');

interface NoticeData { type: 'error' | 'success'; text: string }
const shiftNotice = ref<NoticeData | null>(null);
const itemNotices = reactive<Record<string, NoticeData | null>>({});
const handoverNotice = ref<NoticeData | null>(null);
const carryNotices = reactive<Record<string, NoticeData | null>>({});

const actionBtnStyle = {
  padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#1b5e20',
  color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
} as const;

// 只读角色下按钮仍可点击——点击后在当前区块显示无权限原因，而不是无反应
const readonlyBtnStyle = {
  padding: '6px 12px', borderRadius: '6px', border: '1px dashed #bdbdbd',
  background: '#f5f5f5', color: '#9e9e9e', cursor: 'pointer',
  fontSize: '12px', fontWeight: 600,
} as const;

function roleColor(role: DutyRole) {
  return { admin: '#c62828', leader: '#1b5e20', operator: '#1565c0', visitor: '#8d6e00' }[role];
}

// ---- 草稿（仅在未编辑时跟随服务器版本刷新；编辑中则保留，交由乐观锁拦截） ----
const shiftStartDraft = ref('');
const shiftEndDraft = ref('');
const shiftDirty = ref(false);

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let shiftVersion = -1;
watch(() => store.ongoingShift, (s) => {
  if (!s) return;
  if (s.version !== shiftVersion) {
    shiftVersion = s.version;
    shiftDirty.value = false; // 新版本到来（他人保存或重试成功），跟随最新
  }
  if (!shiftDirty.value) {
    shiftStartDraft.value = toLocalInput(s.startTime);
    shiftEndDraft.value = toLocalInput(s.endTime);
  }
}, { immediate: true });

function markShiftDirty() {
  shiftDirty.value = true;
}

const itemDrafts = reactive<Record<string, { assigneeId: string; status: DutyItemStatus; version: number }>>({});
const dirtyItems = new Set<string>();

// 同步草稿：新版本到来（他人保存或冲突重试成功）时强制跟随；仅当用户正在编辑且版本未变时保留草稿
function syncItemDrafts() {
  store.ongoingItems.forEach((i) => {
    const prev = itemDrafts[i.id];
    if (!prev || prev.version !== i.version || !dirtyItems.has(i.id)) {
      itemDrafts[i.id] = { assigneeId: i.assigneeId ?? '', status: i.status, version: i.version };
      if (!prev || prev.version !== i.version) dirtyItems.delete(i.id);
    }
  });
}
watch(() => store.ongoingItems.map(i => `${i.id}@${i.version}`).join('|'), syncItemDrafts, { immediate: true });

function markItemDirty(id: string) {
  dirtyItems.add(id);
}

const summaryDraft = ref('');
const summaryDirty = ref(false);
let summaryVersion = -1;
watch(() => `${store.ongoingHandover?.id ?? ''}@${store.ongoingHandover?.version ?? 0}`, () => {
  const h = store.ongoingHandover;
  if (!h) return;
  if (h.version !== summaryVersion) {
    summaryVersion = h.version;
    summaryDirty.value = false; // 新版本到来，跟随最新
  }
  if (!summaryDirty.value) summaryDraft.value = h.summary;
}, { immediate: true });

function markSummaryDirty() {
  summaryDirty.value = true;
}

// ---- 通用结果处理 ----
function resultNotice(res: DutyResult<unknown>): NoticeData | null {
  if ('ok' in res) {
    return { type: 'success', text: '已保存，交接状态已同步。' };
  }
  if (res.code === 'conflict') return null; // 冲突弹窗已由 store 弹出
  return { type: 'error', text: res.code === 'forbidden' ? res.reason : res.message };
}

// ---- 操作 ----
function onSwitchUser(id: string) {
  store.switchUser(id);
  shiftNotice.value = null;
  handoverNotice.value = null;
  Object.keys(itemNotices).forEach(k => { itemNotices[k] = null; });
  Object.keys(carryNotices).forEach(k => { carryNotices[k] = null; });
}

function saveShift() {
  if (!store.ongoingShift) return;
  if (!shiftStartDraft.value || !shiftEndDraft.value) {
    shiftNotice.value = { type: 'error', text: '请填写完整的交接班起止时间。' };
    return;
  }
  const res = store.applyOp({
    kind: 'shift',
    id: store.ongoingShift.id,
    patch: {
      startTime: new Date(shiftStartDraft.value).toISOString(),
      endTime: new Date(shiftEndDraft.value).toISOString(),
    },
  });
  const notice = resultNotice(res);
  if (notice?.type === 'success') shiftDirty.value = false;
  shiftNotice.value = notice;
}

function saveItem(id: string) {
  const draft = itemDrafts[id];
  const res = store.applyOp({
    kind: 'item',
    id,
    patch: { assigneeId: draft.assigneeId || null, status: draft.status },
  });
  const notice = resultNotice(res);
  if (notice?.type === 'success') dirtyItems.delete(id);
  itemNotices[id] = notice;
}

function saveSummary() {
  if (!store.ongoingHandover) return;
  const res = store.applyOp({
    kind: 'handover',
    id: store.ongoingHandover.id,
    patch: { summary: summaryDraft.value },
  });
  const notice = resultNotice(res);
  if (notice?.type === 'success') summaryDirty.value = false;
  handoverNotice.value = notice;
}

function completeHandover() {
  if (!store.ongoingHandover) return;
  const res = store.applyOp({
    kind: 'handover',
    id: store.ongoingHandover.id,
    patch: { status: 'completed' },
  });
  handoverNotice.value = resultNotice(res);
}

function confirmCarryover(c: CarryoverItem) {
  if (!store.ongoingHandover) return;
  const res = store.resolveCarryover(store.ongoingHandover, c, 'resolved');
  carryNotices[c.id] = resultNotice(res);
}

function reopenCarryover(c: CarryoverItem) {
  if (!store.ongoingHandover) return;
  const res = store.resolveCarryover(store.ongoingHandover, c, 'pending');
  carryNotices[c.id] = resultNotice(res);
}

// ---- 展示派生 ----
const pendingCarryovers = computed(() =>
  store.ongoingHandover?.carryovers.filter(c => c.status === 'pending') ?? []);

const handoverBadge = computed(() => {
  const h = store.ongoingHandover;
  if (!h) return { text: '', bg: '#eee', color: '#777' };
  if (h.status === 'completed') return { text: '交接完成', bg: '#e8f5e9', color: '#2e7d32' };
  const pending = h.carryovers.filter(c => c.status === 'pending').length;
  return {
    text: pending > 0 ? `交接待确认 · ${pending} 项遗留` : '遗留已闭环，可完成交接',
    bg: '#fff3e0', color: '#e65100',
  };
});

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>
