import type {
  DutyUser, DutyRole, DutyState, DutyResult, DutyConflict, DutyForbidden, FieldDiff,
  Shift, DutyItem, Handover, CarryoverItem,
} from '../types';

/**
 * 值班交接服务层。
 *
 * 当前运行环境没有可用的服务端存储，因此用 localStorage 承担持久化职责，
 * 但语义与后端接口保持一致：
 *  - 所有写操作都带角色校验（权限不通过返回 forbidden，页面需展示原因）；
 *  - 每条记录带 version 乐观锁：版本不一致返回 conflict（只保存一次），
 *    冲突响应里带上服务器最新版本与字段差异，调用方可查看差异并重试；
 *  - storage 事件让多个标签页（模拟两个值班人员）实时同步数据；
 *  - 退出再进入时身份、值班安排、交接状态均从本地持久化恢复。
 */

const STORAGE_KEY = 'iot-duty-state-v1';
const USER_KEY = 'iot-duty-current-user-v1';

export const DUTY_USERS: DutyUser[] = [
  { id: 'u1', name: '王强', role: 'admin' },
  { id: 'u2', name: '李敏', role: 'leader' },
  { id: 'u3', name: '赵磊', role: 'operator' },
  { id: 'u4', name: '孙倩', role: 'visitor' },
  { id: 'u5', name: '周婷', role: 'leader' },
];

export const ROLE_LABELS: Record<DutyRole, string> = {
  admin: '管理员',
  leader: '当班负责人',
  operator: '值班员',
  visitor: '访客（只读）',
};

export const ROLE_HINTS: Record<DutyRole, string> = {
  admin: '管理员：拥有全部值班管理能力，且不影响其他值班记录。',
  leader: '当班负责人：可分配处理人、调整交接班、确认遗留事项。',
  operator: '值班员：仅可查看当班安排与交接记录；分配、调整、确认需当班负责人或管理员。',
  visitor: '访客（只读）：只能查看当班安排和交接记录，不能进行任何修改。',
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function nowIso() {
  return new Date().toISOString();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoAt(base: Date, hour: number, minute = 0, dayOffset = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seedState(): DutyState {
  const today = new Date();
  const shifts: Shift[] = [
    {
      id: 's1',
      name: '今日白班',
      leaderId: 'u2',
      startTime: isoAt(today, 8),
      endTime: isoAt(today, 20),
      status: 'ongoing',
      version: 1,
      updatedBy: 'u1',
      updatedAt: isoAt(today, 7, 55),
    },
    {
      id: 's2',
      name: '昨夜夜班',
      leaderId: 'u5',
      startTime: isoAt(today, 20, 0, -1),
      endTime: isoAt(today, 8),
      status: 'closed',
      version: 1,
      updatedBy: 'u5',
      updatedAt: isoAt(today, 8),
    },
  ];

  const items: DutyItem[] = [
    {
      id: 'i1', shiftId: 's1', title: '危险区域设备 d2 低电量跟进',
      detail: '设备电量 12%，已触发严重告警，需现场更换电池。',
      assigneeId: 'u3', status: 'in_progress',
      version: 1, updatedBy: 'u2', updatedAt: isoAt(today, 8, 30),
    },
    {
      id: 'i2', shiftId: 's1', title: '离线设备 d3 链路排查',
      detail: '设备离线超过 1 小时，联系网络组核查现场网关。',
      assigneeId: null, status: 'pending',
      version: 1, updatedBy: 'u2', updatedAt: isoAt(today, 8, 30),
    },
    {
      id: 'i3', shiftId: 's1', title: '仓库围栏巡查',
      detail: '白班内完成一次仓库区域（f3）围栏与设备位置复核。',
      assigneeId: null, status: 'pending',
      version: 1, updatedBy: 'u2', updatedAt: isoAt(today, 9),
    },
  ];

  const handovers: Handover[] = [
    {
      id: 'h1',
      shiftId: 's1',
      fromShiftName: '昨夜夜班',
      summary: '夜班期间 d2 进入危险区域并出现低电量告警，d3 凌晨起离线；其余设备运行正常。',
      status: 'pending',
      handoverTime: isoAt(today, 8),
      version: 1,
      updatedBy: 'u5',
      updatedAt: isoAt(today, 8),
      carryovers: [
        {
          id: 'c1',
          title: 'd2 低电量未闭环',
          detail: '现场更换电池后需复核设备温度与在线状态。',
          status: 'pending', confirmedBy: null, confirmedAt: null,
          version: 1, updatedBy: 'u5', updatedAt: isoAt(today, 8),
        },
        {
          id: 'c2',
          title: 'd3 离线原因待确认',
          detail: '初步怀疑现场网络抖动，需网络组确认。',
          status: 'resolved', confirmedBy: 'u5', confirmedAt: isoAt(today, 7, 40),
          version: 1, updatedBy: 'u5', updatedAt: isoAt(today, 7, 40),
        },
      ],
    },
    {
      id: 'h2',
      shiftId: 's2',
      fromShiftName: '前一日白班',
      summary: '白班围栏无越界事件；遗留事项均已闭环。',
      status: 'completed',
      handoverTime: isoAt(today, 20, 0, -1),
      version: 1,
      updatedBy: 'u5',
      updatedAt: isoAt(today, 20, 0, -1),
      carryovers: [],
    },
  ];

  return { shifts, items, handovers };
}

function loadState(): DutyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DutyState;
      if (parsed.shifts && parsed.items && parsed.handovers) return parsed;
    }
  } catch {
    // 存储损坏时重建种子数据
  }
  const seeded = seedState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

let state: DutyState = loadState();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- 权限 ----

function canManage(role: DutyRole): boolean {
  return role === 'admin' || role === 'leader';
}

function forbidden(action: string, role: DutyRole): DutyResult<never> {
  const who = ROLE_LABELS[role];
  return {
    code: 'forbidden',
    message: `无权限：${action}仅当班负责人或管理员可执行。`,
    reason:
      role === 'visitor'
        ? `当前身份为「${who}」，只能查看当班安排和交接记录，不能${action}。`
        : `当前身份为「${who}」，无${action}权限，请联系当班负责人或管理员。`,
  };
}

function requireUser(userId: string): DutyUser | DutyForbidden {
  const user = DUTY_USERS.find(u => u.id === userId);
  if (!user) {
    return { code: 'forbidden', message: '身份不存在，请重新选择值班身份。', reason: '当前登录身份无效或已被移除。' };
  }
  return user;
}

function invalid(message: string): DutyResult<never> {
  return { code: 'invalid', message };
}

// ---- 差异计算 ----

const FIELD_LABELS: Record<string, string> = {
  startTime: '交接开始时间',
  endTime: '交接结束时间',
  assigneeId: '处理人',
  status: '状态',
  summary: '交接说明',
};

function fieldValue(entity: string, field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return field === 'assigneeId' ? '未分配' : '（空）';
  }
  if (field === 'assigneeId') {
    return DUTY_USERS.find(u => u.id === value)?.name ?? String(value);
  }
  if (field === 'status') {
    const map: Record<string, string> = {
      pending: '待处理', in_progress: '处理中', done: '已完成',
      ongoing: '进行中', closed: '已关闭', completed: '已完成',
      resolved: '已确认闭环',
    };
    return map[String(value)] ?? String(value);
  }
  return String(value);
}

function buildConflict(
  entity: DutyConflict['entity'],
  id: string,
  server: Shift | DutyItem | Handover | CarryoverItem,
  attempted: Record<string, unknown>,
  updatedByName: string,
): DutyConflict {
  const diffs: FieldDiff[] = Object.keys(attempted)
    .filter(f => f !== 'version')
    .map(field => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      base: '',
      yours: fieldValue(entity, field, attempted[field]),
      theirs: fieldValue(entity, field, (server as unknown as Record<string, unknown>)[field]),
    }))
    .filter(d => d.yours !== d.theirs);
  return {
    code: 'conflict',
    message: `该事项刚被 ${updatedByName} 保存过，您的修改基于旧版本，不能重复保存。请查看差异后选择处理方式。`,
    entity,
    id,
    server: clone(server),
    attempted: clone(attempted),
    diffs,
  };
}

// ---- 跨标签页实时同步 ----

const syncListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      const next = e.newValue ? (JSON.parse(e.newValue) as DutyState) : null;
      if (next) {
        state = next;
        syncListeners.forEach(fn => fn());
      }
    } catch {
      // 忽略无法解析的写入
    }
  });
}

function onSync(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

// ---- 查询 ----

function getState(): DutyState {
  return clone(state);
}

function getCurrentUserId(): string {
  return localStorage.getItem(USER_KEY) || 'u2';
}

function setCurrentUserId(userId: string) {
  localStorage.setItem(USER_KEY, userId);
}

function getUser(userId: string): DutyUser | undefined {
  return DUTY_USERS.find(u => u.id === userId);
}

function touchVersion<T extends { version: number; updatedBy: string; updatedAt: string }>(
  record: T, user: DutyUser,
): T {
  record.version += 1;
  record.updatedBy = user.id;
  record.updatedAt = nowIso();
  return record;
}

// ---- 写操作：当班安排 ----

type ShiftPatch = Partial<Pick<Shift, 'startTime' | 'endTime'>>;

function updateShift(
  userId: string, id: string, patch: ShiftPatch, baseVersion: number,
): DutyResult<Shift> {
  const user = requireUser(userId);
  if ('code' in user) return user;
  if (!canManage(user.role)) return forbidden('调整交接班', user.role);

  const shift = state.shifts.find(s => s.id === id);
  if (!shift) return invalid('排班不存在或已被删除。');
  if (shift.version !== baseVersion) {
    const updatedBy = getUser(shift.updatedBy)?.name ?? '其他人';
    return buildConflict('shift', id, shift, { ...patch, version: baseVersion }, updatedBy);
  }
  if (patch.startTime && patch.endTime && new Date(patch.endTime) <= new Date(patch.startTime)) {
    return invalid('结束时间必须晚于开始时间。');
  }
  Object.assign(shift, patch);
  touchVersion(shift, user);
  persist();
  return { ok: true, data: clone(shift) };
}

// ---- 写操作：处理人分配 ----

type ItemPatch = Partial<Pick<DutyItem, 'assigneeId' | 'status'>>;

function updateDutyItem(
  userId: string, id: string, patch: ItemPatch, baseVersion: number,
): DutyResult<DutyItem> {
  const user = requireUser(userId);
  if ('code' in user) return user;
  if (!canManage(user.role)) return forbidden('分配处理人', user.role);

  const item = state.items.find(i => i.id === id);
  if (!item) return invalid('值班事项不存在或已被删除。');
  if (patch.assigneeId && !getUser(patch.assigneeId)) {
    return invalid('所选处理人不存在。');
  }
  if (item.version !== baseVersion) {
    const updatedBy = getUser(item.updatedBy)?.name ?? '其他人';
    return buildConflict('item', id, item, { ...patch, version: baseVersion }, updatedBy);
  }
  Object.assign(item, patch);
  touchVersion(item, user);
  persist();
  return { ok: true, data: clone(item) };
}

// ---- 写操作：交接单 ----

type HandoverPatch = Partial<Pick<Handover, 'summary' | 'status'>>;

function updateHandover(
  userId: string, id: string, patch: HandoverPatch, baseVersion: number,
): DutyResult<Handover> {
  const user = requireUser(userId);
  if ('code' in user) return user;
  if (!canManage(user.role)) return forbidden('调整交接', user.role);

  const handover = state.handovers.find(h => h.id === id);
  if (!handover) return invalid('交接记录不存在或已被删除。');
  if (handover.version !== baseVersion) {
    const updatedBy = getUser(handover.updatedBy)?.name ?? '其他人';
    return buildConflict('handover', id, handover, { ...patch, version: baseVersion }, updatedBy);
  }
  if (patch.status === 'completed' && handover.carryovers.some(c => c.status === 'pending')) {
    return invalid('仍有遗留事项未确认闭环，不能完成交接。');
  }
  if (patch.summary !== undefined && !patch.summary.trim()) {
    return invalid('交接说明不能为空。');
  }
  Object.assign(handover, patch);
  if (patch.status === 'completed' && !handover.handoverTime) {
    handover.handoverTime = nowIso();
  }
  touchVersion(handover, user);
  persist();
  return { ok: true, data: clone(handover) };
}

// ---- 写操作：确认遗留事项 ----

type CarryoverPatch = Partial<Pick<CarryoverItem, 'status'>>;

function updateCarryover(
  userId: string, handoverId: string, carryoverId: string,
  patch: CarryoverPatch, baseVersion: number,
): DutyResult<CarryoverItem> {
  const user = requireUser(userId);
  if ('code' in user) return user;
  if (!canManage(user.role)) return forbidden('确认遗留事项', user.role);

  const handover = state.handovers.find(h => h.id === handoverId);
  if (!handover) return invalid('交接记录不存在或已被删除。');
  const carry = handover.carryovers.find(c => c.id === carryoverId);
  if (!carry) return invalid('遗留事项不存在或已被删除。');
  if (carry.version !== baseVersion) {
    const updatedBy = getUser(carry.updatedBy)?.name ?? '其他人';
    return buildConflict('carryover', carryoverId, carry, { ...patch, version: baseVersion }, updatedBy);
  }
  Object.assign(carry, patch);
  if (carry.status === 'resolved') {
    carry.confirmedBy = user.id;
    carry.confirmedAt = nowIso();
  } else {
    carry.confirmedBy = null;
    carry.confirmedAt = null;
  }
  touchVersion(carry, user);
  // 嵌套对象变更也提升交接单版本，保证同一交接单的并发保存互斥可见
  handover.updatedAt = nowIso();
  persist();
  return { ok: true, data: clone(carry) };
}

export const dutyService = {
  ROLE_LABELS,
  users: DUTY_USERS,
  getState,
  getUser,
  getCurrentUserId,
  setCurrentUserId,
  updateShift,
  updateDutyItem,
  updateHandover,
  updateCarryover,
  onSync,
};
