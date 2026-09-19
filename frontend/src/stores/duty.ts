import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  DutyState, DutyUser, DutyRole, Shift, DutyItem, Handover, CarryoverItem,
  DutyResult, DutyConflict,
} from '../types';
import { dutyService, ROLE_LABELS } from '../services/dutyService';

/** 冲突待重试操作描述：重试时始终读取服务器最新版本号 */
type PendingOp =
  | { kind: 'shift'; id: string; patch: Record<string, unknown> }
  | { kind: 'item'; id: string; patch: Record<string, unknown> }
  | { kind: 'handover'; id: string; patch: Record<string, unknown> }
  | { kind: 'carryover'; handoverId: string; id: string; patch: Record<string, unknown> };

export interface ActiveConflict {
  conflict: DutyConflict;
  op: PendingOp;
}

function emptyState(): DutyState {
  return { shifts: [], items: [], handovers: [] };
}

export const useDutyStore = defineStore('duty', () => {
  const dutyState = ref<DutyState>(emptyState());
  const currentUserId = ref<string>(dutyService.getCurrentUserId());
  const activeConflict = ref<ActiveConflict | null>(null);
  let initialized = false;

  function refresh() {
    dutyState.value = dutyService.getState();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    refresh();
    // 另一个标签页（另一名值班人员）写入后立即同步
    dutyService.onSync(() => refresh());
    // 身份在其他标签页变更时也同步，保证入口与权限状态一致
    window.addEventListener('storage', (e) => {
      if (e.key === 'iot-duty-current-user-v1' && e.newValue) {
        currentUserId.value = e.newValue;
      }
    });
  }

  const currentUser = computed<DutyUser | undefined>(() =>
    dutyService.getUser(currentUserId.value));
  const currentRole = computed<DutyRole>(() => currentUser.value?.role ?? 'visitor');
  const canManage = computed(() => {
    const r = currentRole.value;
    return r === 'admin' || r === 'leader';
  });
  const roleLabel = computed(() => ROLE_LABELS[currentRole.value]);

  const ongoingShifts = computed(() =>
    dutyState.value.shifts.filter(s => s.status === 'ongoing'));
  const ongoingShift = computed<Shift | undefined>(() => ongoingShifts.value[0]);

  const ongoingItems = computed<DutyItem[]>(() => {
    if (!ongoingShift.value) return [];
    return dutyState.value.items
      .filter(i => i.shiftId === ongoingShift.value!.id)
      .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  });

  const ongoingHandover = computed<Handover | undefined>(() => {
    if (!ongoingShift.value) return undefined;
    return dutyState.value.handovers.find(h => h.shiftId === ongoingShift.value!.id);
  });

  const historyHandovers = computed<Handover[]>(() => {
    const currentId = ongoingHandover.value?.id;
    return dutyState.value.handovers
      .filter(h => h.id !== currentId)
      .sort((a, b) => (b.handoverTime || '').localeCompare(a.handoverTime || ''));
  });

  function userName(id: string | null): string {
    if (!id) return '未分配';
    return dutyService.getUser(id)?.name ?? '未知人员';
  }

  function userRoleOf(id: string | null): string {
    if (!id) return '';
    const u = dutyService.getUser(id);
    return u ? ROLE_LABELS[u.role] : '';
  }

  function shiftName(id: string): string {
    return dutyState.value.shifts.find(s => s.id === id)?.name ?? '未知班次';
  }

  function switchUser(id: string) {
    dutyService.setCurrentUserId(id);
    currentUserId.value = id;
    // 角色变更后立即以新权限视角重新拉取数据
    refresh();
  }

  /**
   * 执行一次受控写操作。
   * - ok：刷新本地状态（持久化由服务层完成，退出重进仍保留）
   * - forbidden/invalid：交回页面在当前位置展示原因
   * - conflict：弹出差异对话框，仅一方能保存成功
   */
  function applyOp(op: PendingOp): DutyResult<unknown> {
    // 客户端权限预判：与服务层规则保持一致，无权操作立即在当前区块说明原因
    if (!canManage.value && currentUser.value) {
      const actionMap: Record<PendingOp['kind'], string> = {
        shift: '调整交接班',
        item: '分配处理人',
        handover: '调整交接',
        carryover: '确认遗留事项',
      };
      const role = currentRole.value;
      const who = ROLE_LABELS[role];
      const action = actionMap[op.kind];
      return {
        code: 'forbidden',
        message: `无权限：${action}仅当班负责人或管理员可执行。`,
        reason:
          role === 'visitor'
            ? `当前身份为「${who}」，只能查看当班安排和交接记录，不能${action}。`
            : `当前身份为「${who}」，无${action}权限，请联系当班负责人或管理员。`,
      };
    }

    const uid = currentUserId.value;
    let res: DutyResult<unknown>;
    if (op.kind === 'shift') {
      const version = dutyState.value.shifts.find(s => s.id === op.id)?.version ?? -1;
      res = dutyService.updateShift(uid, op.id, op.patch as never, version);
    } else if (op.kind === 'item') {
      const version = dutyState.value.items.find(i => i.id === op.id)?.version ?? -1;
      res = dutyService.updateDutyItem(uid, op.id, op.patch as never, version);
    } else if (op.kind === 'handover') {
      const version = dutyState.value.handovers.find(h => h.id === op.id)?.version ?? -1;
      res = dutyService.updateHandover(uid, op.id, op.patch as never, version);
    } else {
      const handover = dutyState.value.handovers.find(h => h.id === op.handoverId);
      const carry = handover?.carryovers.find(c => c.id === op.id);
      res = dutyService.updateCarryover(uid, op.handoverId, op.id, op.patch as never, carry?.version ?? -1);
    }

    if ('ok' in res) {
      refresh();
      return res;
    }
    if (res.code === 'conflict') {
      activeConflict.value = { conflict: res, op };
    }
    return res;
  }

  /** 冲突后用我的修改重试：携带服务器最新版本号再次提交 */
  function retryConflict() {
    const pending = activeConflict.value;
    if (!pending) return;
    activeConflict.value = null;
    applyOp(pending.op);
  }

  /** 冲突后采用服务器版本：放弃本地修改，仅刷新查看 */
  function adoptServerVersion() {
    activeConflict.value = null;
    refresh();
  }

  function resolveCarryover(h: Handover, c: CarryoverItem, status: 'pending' | 'resolved') {
    return applyOp({ kind: 'carryover', handoverId: h.id, id: c.id, patch: { status } });
  }

  return {
    dutyState, currentUserId, currentUser, currentRole, roleLabel, canManage, activeConflict,
    ongoingShift, ongoingShifts, ongoingItems, ongoingHandover, historyHandovers,
    init, refresh, switchUser, userName, userRoleOf, shiftName,
    applyOp, retryConflict, adoptServerVersion, resolveCarryover,
  };
});
