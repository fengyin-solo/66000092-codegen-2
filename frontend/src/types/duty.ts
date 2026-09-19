// 值班与交接模块的领域模型
// 该模块独立于设备/围栏/告警模块，历史交接记录归档后只读，不受新操作影响。

export type DutyRole = 'leader' | 'visitor' | 'admin';

export interface DutyMember {
  id: string;
  name: string;
  position: string;
}

/** 当班中 -> 待交接确认 -> 已交接(归档) */
export type ShiftStatus = 'ongoing' | 'pending_handover' | 'handed_over';

export interface Shift {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  startedAt: string; // ISO
  plannedEndAt: string; // ISO，计划交班时间（"调整交接班"作用于此字段）
  actualEndAt: string | null;
  status: ShiftStatus;
  version: number; // 乐观锁版本
}

export type HandoverItemStatus = 'pending' | 'in_progress' | 'done';

export interface HandoverItem {
  id: string;
  shiftId: string;
  title: string;
  detail: string;
  assigneeId: string | null; // 处理人
  status: HandoverItemStatus;
  confirmed: boolean; // 当班负责人是否已确认该遗留事项
  confirmedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
  version: number; // 乐观锁版本：两人同时改同一项时，只有一次保存能成功
}

export type HandoverRecordStatus = 'draft' | 'submitted' | 'confirmed';

export interface HandoverRecord {
  id: string;
  shiftId: string;
  summary: string;
  status: HandoverRecordStatus;
  submittedAt: string | null;
  confirmedAt: string | null;
  version: number; // 乐观锁版本
}

export interface HandoverItemPatch {
  title?: string;
  detail?: string;
  assigneeId?: string | null;
  status?: HandoverItemStatus;
  confirmed?: boolean;
}

export interface DutyStateSnapshot {
  stateVersion: 1;
  currentRole: DutyRole;
  members: DutyMember[];
  shifts: Shift[];
  items: HandoverItem[];
  records: HandoverRecord[];
}

/**
 * 受控操作的统一返回结果：
 * - forbidden：权限不足，调用方须在当前页面说明原因
 * - conflict：乐观锁冲突，current 为已保存的最新版本，供差异对比与重试
 * - invalid：业务校验不通过
 */
export type DutyMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'forbidden'; message: string }
  | { ok: false; code: 'invalid'; message: string }
  | { ok: false; code: 'conflict'; message: string; current: T };

export interface DutyFeedback {
  tone: 'deny' | 'conflict' | 'success' | 'info';
  text: string;
}
