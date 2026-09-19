import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  DutyRole, DutyMember, Shift, ShiftStatus, HandoverItem, HandoverItemStatus,
  HandoverItemPatch, HandoverRecord, DutyStateSnapshot, DutyMutationResult, DutyFeedback,
} from '../types/duty';

const STORAGE_KEY = 'iot-duty-state-v1';

function genId(prefix: string) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 供 <input type="datetime-local"> 使用：YYYY-MM-DDTHH:mm（本地时区） */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSeed(): DutyStateSnapshot {
  const now = Date.now();
  const h = 3600_000;
  const iso = (t: number) => new Date(t).toISOString();

  const members: DutyMember[] = [
    { id: 'u1', name: '李当班', position: '当班负责人' },
    { id: 'u2', name: '王运维', position: '运维工程师' },
    { id: 'u3', name: '张巡检', position: '巡检员' },
    { id: 'u4', name: '赵监控', position: '监控员' },
  ];

  // 上一班：已归档（只读）
  const prevShift: Shift = {
    id: 's0',
    name: '昨日夜班',
    leaderId: 'u3',
    memberIds: ['u3', 'u4'],
    startedAt: iso(now - 28 * h),
    plannedEndAt: iso(now - 16 * h),
    actualEndAt: iso(now - 16 * h),
    status: 'handed_over',
    version: 1,
  };
  const prevRecord: HandoverRecord = {
    id: 'r0',
    shiftId: 's0',
    summary: '夜班设备运行平稳，传感器-B02 电量偏低已登记，留待白班跟进。',
    status: 'confirmed',
    submittedAt: iso(now - 16 * h + 5 * 60000),
    confirmedAt: iso(now - 16 * h + 10 * 60000),
    version: 1,
  };
  const prevItem: HandoverItem = {
    id: 'i0',
    shiftId: 's0',
    title: '传感器-B02 低电量跟进',
    detail: '夜班发现电量 12%，已通知运维，白班确认充电情况。',
    assigneeId: 'u2',
    status: 'done',
    confirmed: true,
    confirmedAt: iso(now - 14 * h),
    updatedBy: '张巡检',
    updatedAt: iso(now - 16 * h),
    version: 2,
  };

  // 当前班：进行中
  const currentShift: Shift = {
    id: 's1',
    name: '今日白班',
    leaderId: 'u1',
    memberIds: ['u1', 'u2', 'u3'],
    startedAt: iso(now - 4 * h),
    plannedEndAt: iso(now + 4 * h),
    actualEndAt: null,
    status: 'ongoing',
    version: 1,
  };
  const currentRecord: HandoverRecord = {
    id: 'r1',
    shiftId: 's1',
    summary: '',
    status: 'draft',
    submittedAt: null,
    confirmedAt: null,
    version: 0,
  };
  const items: HandoverItem[] = [
    {
      id: 'i1',
      shiftId: 's1',
      title: '传感器-B02 更换电池',
      detail: '设备仍处低电量告警（12%），需现场更换电池并复测在线状态。',
      assigneeId: null,
      status: 'pending',
      confirmed: false,
      confirmedAt: null,
      updatedBy: null,
      updatedAt: iso(now - 3 * h),
      version: 1,
    },
    {
      id: 'i2',
      shiftId: 's1',
      title: '追踪器-C03 离线排查',
      detail: '离线超过 1 小时，疑似供电问题，已联系现场人员。',
      assigneeId: 'u2',
      status: 'in_progress',
      confirmed: false,
      confirmedAt: null,
      updatedBy: '李当班',
      updatedAt: iso(now - 90 * 60000),
      version: 1,
    },
    {
      id: 'i3',
      shiftId: 's1',
      title: '危险区域围栏巡检确认',
      detail: 'f2 围栏今日两次进入告警，现场确认为授权作业，无需处理。',
      assigneeId: 'u3',
      status: 'done',
      confirmed: true,
      confirmedAt: iso(now - 2 * h),
      updatedBy: '李当班',
      updatedAt: iso(now - 2 * h),
      version: 1,
    },
  ];

  return {
    stateVersion: 1,
    currentRole: 'visitor', // 默认访客，可在页面切换；选择会持久化
    members,
    shifts: [currentShift, prevShift],
    items: [...items, prevItem],
    records: [currentRecord, prevRecord],
  };
}

function loadState(): DutyStateSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DutyStateSnapshot;
      if (parsed.stateVersion === 1) return parsed;
    }
  } catch {
    // 存储损坏时回退到种子数据
  }
  return buildSeed();
}

export const useDutyStore = defineStore('duty', () => {
  const initial = loadState();

  const currentRole = ref<DutyRole>(initial.currentRole);
  const members = ref<DutyMember[]>(initial.members);
  const shifts = ref<Shift[]>(initial.shifts);
  const items = ref<HandoverItem[]>(initial.items);
  const records = ref<HandoverRecord[]>(initial.records);

  // 最近一次操作反馈；无权限/冲突等信息由这里在当前页面说明，而不是让按钮静默失效
  const feedback = ref<DutyFeedback | null>(null);

  let feedbackTimer: number | null = null;
  function notify(fb: DutyFeedback, sticky = false) {
    feedback.value = fb;
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    if (!sticky) {
      feedbackTimer = window.setTimeout(() => { feedback.value = null; }, 9000);
    }
  }
  function clearFeedback() {
    feedback.value = null;
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
  }

  function persist() {
    const snapshot: DutyStateSnapshot = {
      stateVersion: 1,
      currentRole: currentRole.value,
      members: members.value,
      shifts: shifts.value,
      items: items.value,
      records: records.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  /**
   * 接收其它标签页/终端写入的状态（storage 事件）。
   * 角色变更由此即时同步：值班入口权限与交接状态立即更新，无需刷新。
   */
  function applyExternalState(s: DutyStateSnapshot) {
    if (s.stateVersion !== 1) return;
    currentRole.value = s.currentRole;
    members.value = s.members;
    shifts.value = s.shifts;
    items.value = s.items;
    records.value = s.records;
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      applyExternalState(JSON.parse(e.newValue) as DutyStateSnapshot);
      notify({ tone: 'info', text: '值班数据已从其他终端同步（可能存在新的修改，保存时将自动检测冲突）' });
    } catch {
      // 忽略无法解析的外部状态
    }
  });

  // ---- 派生视图 ----
  const currentShift = computed<Shift | null>(
    () => shifts.value.find(s => s.status !== 'handed_over')
      ?? [...shifts.value].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0]
      ?? null,
  );
  const historyShifts = computed(() =>
    shifts.value
      .filter(s => s.id !== currentShift.value?.id)
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)),
  );

  function shiftItems(shiftId: string) {
    return items.value
      .filter(i => i.shiftId === shiftId)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }
  const currentItems = computed(() =>
    currentShift.value ? shiftItems(currentShift.value.id) : [],
  );

  function recordOf(shiftId: string) {
    return records.value.find(r => r.shiftId === shiftId) ?? null;
  }
  const currentRecord = computed(() =>
    currentShift.value ? recordOf(currentShift.value.id) : null,
  );

  const pendingConfirmCount = computed(() =>
    currentItems.value.filter(i => !i.confirmed).length,
  );

  function memberName(id: string | null | undefined): string {
    if (!id) return '未分配';
    return members.value.find(m => m.id === id)?.name ?? '未知成员';
  }
  function getMember(id: string) {
    return members.value.find(m => m.id === id);
  }

  const isLeader = computed(() => currentRole.value === 'leader');
  const isVisitor = computed(() => currentRole.value === 'visitor');
  const isAdmin = computed(() => currentRole.value === 'admin');
  /** 可执行值班受控写操作的角色：当班负责人、管理员（访客只读） */
  const canManage = computed(() => currentRole.value === 'leader' || currentRole.value === 'admin');

  const roleLabel = computed(() =>
    ({ leader: '当班负责人', visitor: '访客', admin: '管理员' })[currentRole.value],
  );

  // ---- 鉴权与守卫 ----
  const ROLE_REASON = '访客仅可查看当班安排与交接记录，不能执行该操作；如需处理，请由当班负责人在页面顶部切换身份。';

  function requireManage(action: string): DutyMutationResult<never> | null {
    if (!canManage.value) {
      return { ok: false, code: 'forbidden', message: `无权限${action}。${ROLE_REASON}` };
    }
    return null;
  }

  function getActiveShift(): Shift | null {
    const s = currentShift.value;
    if (!s || s.status === 'handed_over') return null;
    return s;
  }

  // ---- 角色 ----
  function setRole(role: DutyRole) {
    currentRole.value = role;
    persist();
    notify({ tone: 'info', text: `当前身份已切换为「${roleLabel.value}」，值班入口权限与交接状态已立即同步。` });
  }

  // ---- 交接事项（带乐观锁） ----
  function assignAssignee(itemId: string, assigneeId: string | null, baseVersion: number): DutyMutationResult<HandoverItem> {
    const denied = requireManage('分配处理人');
    if (denied) return denied;
    if (!getActiveShift()) return { ok: false, code: 'invalid', message: '当前班次已归档，不能再分配处理人。' };

    const idx = items.value.findIndex(i => i.id === itemId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '交接事项不存在。' };
    const item = items.value[idx];
    if (item.version !== baseVersion) {
      return {
        ok: false, code: 'conflict',
        message: '该事项刚被其他人保存过（处理人可能已变化），本次未保存，请查看差异后重试。',
        current: { ...item },
      };
    }
    const updated: HandoverItem = {
      ...item,
      assigneeId,
      updatedBy: memberName(getCurrentMemberId()),
      updatedAt: new Date().toISOString(),
      version: item.version + 1,
    };
    items.value[idx] = updated;
    persist();
    notify({ tone: 'success', text: `已将「${item.title}」的处理人调整为 ${memberName(assigneeId)}。` });
    return { ok: true, data: updated };
  }

  function saveItem(
    itemId: string,
    patch: HandoverItemPatch,
    baseVersion: number,
  ): DutyMutationResult<HandoverItem> {
    const denied = requireManage('修改交接事项');
    if (denied) return denied;
    if (!getActiveShift()) return { ok: false, code: 'invalid', message: '当前班次已归档，历史交接事项只读。' };

    const idx = items.value.findIndex(i => i.id === itemId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '交接事项不存在。' };
    const item = items.value[idx];

    // 两人同时修改同一事项：版本不匹配即拒绝，保证只能保存一次
    if (item.version !== baseVersion) {
      return {
        ok: false, code: 'conflict',
        message: '该交接事项在你编辑期间已被其他人保存，本次修改未写入。请对比下方差异，并在最新内容上重试。',
        current: { ...item },
      };
    }

    if (patch.title !== undefined && patch.title.trim() === '') {
      return { ok: false, code: 'invalid', message: '事项标题不能为空。' };
    }

    const now = new Date().toISOString();
    const confirming = patch.confirmed === true && !item.confirmed;
    const updated: HandoverItem = {
      ...item,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : item.title,
      confirmed: patch.confirmed ?? item.confirmed,
      confirmedAt: confirming ? now : (patch.confirmed === false ? null : item.confirmedAt),
      updatedBy: memberName(getCurrentMemberId()),
      updatedAt: now,
      version: item.version + 1,
    };
    items.value[idx] = updated;
    persist();
    notify({
      tone: 'success',
      text: confirming ? `已确认遗留事项「${updated.title}」。` : `交接事项「${updated.title}」已保存。`,
    });
    return { ok: true, data: updated };
  }

  function addItem(input: { title: string; detail: string; assigneeId: string | null }): DutyMutationResult<HandoverItem> {
    const denied = requireManage('新增交接事项');
    if (denied) return denied;
    const shift = getActiveShift();
    if (!shift) return { ok: false, code: 'invalid', message: '当前班次已归档，不能新增事项。' };
    if (!input.title.trim()) return { ok: false, code: 'invalid', message: '事项标题不能为空。' };

    const now = new Date().toISOString();
    const item: HandoverItem = {
      id: genId('i'),
      shiftId: shift.id,
      title: input.title.trim(),
      detail: input.detail,
      assigneeId: input.assigneeId,
      status: 'pending',
      confirmed: false,
      confirmedAt: null,
      updatedBy: memberName(getCurrentMemberId()),
      updatedAt: now,
      version: 1,
    };
    items.value.unshift(item);
    persist();
    notify({ tone: 'success', text: `已新增交接事项「${item.title}」。` });
    return { ok: true, data: item };
  }

  // ---- 调整交接班时间（带乐观锁） ----
  function adjustShift(
    shiftId: string,
    plannedEndAt: string,
    baseVersion: number,
  ): DutyMutationResult<Shift> {
    const denied = requireManage('调整交接班时间');
    if (denied) return denied;

    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '班次不存在。' };
    const shift = shifts.value[idx];
    if (shift.status === 'handed_over') {
      return { ok: false, code: 'invalid', message: '该班次已交接归档，交接班时间不能再调整。' };
    }
    if (shift.version !== baseVersion) {
      return {
        ok: false, code: 'conflict',
        message: '交接班时间刚被其他人调整，本次修改未保存。请查看差异后在最新时间上重试。',
        current: { ...shift },
      };
    }
    const endMs = new Date(plannedEndAt).getTime();
    if (Number.isNaN(endMs) || endMs <= new Date(shift.startedAt).getTime()) {
      return { ok: false, code: 'invalid', message: '交班时间必须晚于本班开始时间。' };
    }
    const updated: Shift = { ...shift, plannedEndAt, version: shift.version + 1 };
    shifts.value[idx] = updated;
    persist();
    notify({ tone: 'success', text: `交接班时间已调整为 ${formatTime(plannedEndAt)}。` });
    return { ok: true, data: updated };
  }

  // ---- 交接记录：提交 / 确认（带乐观锁） ----
  function submitHandover(
    shiftId: string,
    summary: string,
    baseVersion: number,
  ): DutyMutationResult<HandoverRecord> {
    const denied = requireManage('提交交接');
    if (denied) return denied;

    const idx = records.value.findIndex(r => r.shiftId === shiftId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '交接记录不存在。' };
    const record = records.value[idx];
    if (record.status === 'confirmed') {
      return { ok: false, code: 'invalid', message: '交接记录已确认归档，不能重复提交。' };
    }
    if (record.version !== baseVersion) {
      return {
        ok: false, code: 'conflict',
        message: '交接记录在你编辑期间已被其他人保存，本次提交未生效。请查看差异后重试。',
        current: { ...record },
      };
    }
    const unconfirmed = shiftItems(shiftId).filter(i => !i.confirmed);
    if (unconfirmed.length > 0) {
      return {
        ok: false, code: 'invalid',
        message: `还有 ${unconfirmed.length} 项遗留事项未经当班负责人确认，请先确认后再提交交接。`,
      };
    }
    const now = new Date().toISOString();
    const updated: HandoverRecord = {
      ...record,
      summary: summary.trim(),
      status: 'submitted',
      submittedAt: now,
      version: record.version + 1,
    };
    records.value[idx] = updated;

    const sIdx = shifts.value.findIndex(s => s.id === shiftId);
    if (sIdx !== -1 && shifts.value[sIdx].status === 'ongoing') {
      shifts.value[sIdx] = { ...shifts.value[sIdx], status: 'pending_handover' as ShiftStatus };
    }
    persist();
    notify({ tone: 'success', text: '交接记录已提交，等待当班负责人最终确认。' });
    return { ok: true, data: updated };
  }

  function confirmHandover(
    shiftId: string,
    baseVersion: number,
  ): DutyMutationResult<HandoverRecord> {
    const denied = requireManage('确认交接');
    if (denied) return denied;

    const idx = records.value.findIndex(r => r.shiftId === shiftId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '交接记录不存在。' };
    const record = records.value[idx];
    if (record.status !== 'submitted') {
      return { ok: false, code: 'invalid', message: '交接记录尚未提交，不能确认。' };
    }
    if (record.version !== baseVersion) {
      return {
        ok: false, code: 'conflict',
        message: '交接记录在确认前被其他人修改，本次确认未生效，请刷新查看差异后重试。',
        current: { ...record },
      };
    }
    const now = new Date().toISOString();
    const updated: HandoverRecord = {
      ...record,
      status: 'confirmed',
      confirmedAt: now,
      version: record.version + 1,
    };
    records.value[idx] = updated;

    const sIdx = shifts.value.findIndex(s => s.id === shiftId);
    if (sIdx !== -1) {
      const s = shifts.value[sIdx];
      shifts.value[sIdx] = { ...s, status: 'handed_over' as ShiftStatus, actualEndAt: now };
    }
    persist();
    notify({ tone: 'success', text: '交接已确认，本班次归档为只读历史记录。' });
    return { ok: true, data: updated };
  }

  /**
   * 模拟"另一终端上的人"抢先保存（也可直接在另一个浏览器标签页操作，
   * 两个标签页会通过 storage 事件实时同步）。仅修改内容并提升版本，
   * 用于在单一页面内验证并发冲突的差异展示与重试流程。
   */
  function simulateExternalItemChange(itemId: string): DutyMutationResult<HandoverItem> {
    const idx = items.value.findIndex(i => i.id === itemId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '交接事项不存在。' };
    const item = items.value[idx];
    const updated: HandoverItem = {
      ...item,
      detail: `${item.detail}\n【其他终端 ${formatTime(new Date().toISOString())}】已将处理优先级提为最高，并补充了现场照片。`,
      status: (item.status === 'done' ? 'in_progress' : 'done') as HandoverItemStatus,
      updatedBy: '其他终端-同事',
      updatedAt: new Date().toISOString(),
      version: item.version + 1,
    };
    items.value[idx] = updated;
    persist();
    return { ok: true, data: updated };
  }

  function simulateExternalShiftChange(shiftId: string): DutyMutationResult<Shift> {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) return { ok: false, code: 'invalid', message: '班次不存在。' };
    const shift = shifts.value[idx];
    const bumped: Shift = {
      ...shift,
      plannedEndAt: new Date(new Date(shift.plannedEndAt).getTime() + 30 * 60000).toISOString(),
      version: shift.version + 1,
    };
    shifts.value[idx] = bumped;
    persist();
    return { ok: true, data: bumped };
  }

  // 当前角色对应的"操作者"：当班负责人即本班 leader；其余角色仅用于审计展示
  function getCurrentMemberId(): string | null {
    const shift = currentShift.value;
    if (!shift) return null;
    if (currentRole.value === 'leader') return shift.leaderId;
    if (currentRole.value === 'admin') return members.value[0]?.id ?? null;
    return null;
  }

  return {
    // state
    currentRole, members, shifts, items, records, feedback,
    // computed
    currentShift, historyShifts, currentItems, currentRecord,
    pendingConfirmCount, isLeader, isVisitor, isAdmin, canManage, roleLabel,
    // helpers
    shiftItems, recordOf, memberName, getMember,
    notify, clearFeedback, setRole,
    assignAssignee, saveItem, addItem,
    adjustShift, submitHandover, confirmHandover,
    simulateExternalItemChange, simulateExternalShiftChange,
  };
});
