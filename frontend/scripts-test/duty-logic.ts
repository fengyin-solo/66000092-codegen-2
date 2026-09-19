// 值班模块核心逻辑验证（Node 环境，shim 浏览器 API）
// 覆盖：受控鉴权、无权限返回原因、持久化与重载保持、跨终端 storage 同步、
//      乐观锁（同一项并发修改只保存一次 + 冲突重试）、归档只读、管理员不受限。

declare const process: { exit(code: number): never };

// ---- 浏览器 API shim ----
const storageMap = new Map<string, string>();
const listeners: Array<(e: any) => void> = [];
const localStorageShim = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => { storageMap.set(k, v); },
  removeItem: (k: string) => { storageMap.delete(k); },
};
(globalThis as any).window = {
  addEventListener: (_t: string, fn: any) => listeners.push(fn),
  setTimeout: (fn: any) => setTimeout(fn, 9000),
  clearTimeout: (id: any) => clearTimeout(id),
};
(globalThis as any).localStorage = localStorageShim;

import { createPinia } from 'pinia';
import { useDutyStore } from '../src/stores/duty';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

// ========== 标签页 A：首次进入（默认访客） ==========
console.log('\n[1] 初始身份为访客，受控操作被拒绝并返回原因');
const piniaA = createPinia();
const a = useDutyStore(piniaA);
check('默认访客', a.currentRole === 'visitor');
check('访客无管理权限', a.canManage === false);

const item = a.items.find(i => i.id === 'i1')!;
const deny1 = a.assignAssignee(item.id, 'u2', item.version);
check('访客分配处理人被拒', deny1.ok === false && deny1.code === 'forbidden');
check('拒绝结果包含具体原因', !deny1.ok && deny1.message.includes('访客仅可查看'));
const deny2 = a.saveItem(item.id, { confirmed: true }, item.version);
check('访客确认遗留事项被拒', deny2.ok === false && deny2.code === 'forbidden');
const deny3 = a.adjustShift('s1', new Date(Date.now() + 8 * 3600000).toISOString(), 1);
check('访客调整交接班被拒', deny3.ok === false && deny3.code === 'forbidden');
// 页面层（DutyPanel.guard / 弹窗）在当前页面展示拒绝原因，而不是按钮无反应
if (!deny3.ok) a.notify({ tone: 'deny', text: deny3.message });
check('页面反馈条已展示原因', a.feedback !== null && a.feedback.tone === 'deny' && a.feedback.text.includes('访客'));
check('被拒后数据未变化（版本不变）', a.items.find(i => i.id === 'i1')!.version === 1);

console.log('\n[2] 切换为当班负责人后立即生效并持久化');
a.setRole('leader');
check('切换后立即可管理', a.canManage === true);
const persistedRaw = storageMap.get('iot-duty-state-v1')!;
check('角色已写入 localStorage', persistedRaw.includes('"currentRole":"leader"'));

console.log('\n[3] 负责人分配处理人 / 确认遗留事项');
const r1 = a.assignAssignee('i1', 'u2', 1);
check('分配处理人成功并升版本', r1.ok && r1.data.assigneeId === 'u2' && r1.data.version === 2);
const r2 = a.saveItem('i1', { confirmed: true }, 2);
check('确认遗留事项成功', r2.ok && r2.data.confirmed === true && r2.data.version === 3);
const r2b = a.saveItem('i2', { status: 'in_progress' }, a.items.find(x => x.id === 'i2')!.version);
check('i2 保存成功', r2b.ok);
// i3 已是 confirmed

console.log('\n[4] 乐观锁：两人同时修改同一事项只能保存一次');
// 同事以 v3 基线抢先保存成功
const peer = a.saveItem('i1', { detail: '同事的修改' }, 3);
check('第一次保存（同事）成功', peer.ok && (peer as any).data.version === 4);
// 我仍以打开时的 v3 基线保存
const mine = a.saveItem('i1', { title: '我的修改' }, 3);
check('第二次保存（我）被拒绝', mine.ok === false);
check('冲突返回最新版本供差异对比', !mine.ok && mine.code === 'conflict' && mine.current.version === 4 && mine.current.detail === '同事的修改');
check('冲突后服务端仍只有一次保存（版本=4，内容是同事的）',
  a.items.find(i => i.id === 'i1')!.version === 4 && a.items.find(i => i.id === 'i1')!.title === '传感器-B02 更换电池');

console.log('\n[5] 冲突方在最新版本上重试成功');
const retry = a.saveItem('i1', { title: '我的修改-合并重试' }, 4);
check('以 v4 基线重试成功并升到 v5', retry.ok && (retry as any).data.version === 5);
check('重试后标题为我的内容', a.items.find(i => i.id === 'i1')!.title === '我的修改-合并重试');

console.log('\n[6] 交接班时间同样受乐观锁保护');
const s1 = a.shifts.find(s => s.id === 's1')!;
const adj1 = a.adjustShift('s1', new Date(Date.now() + 6 * 3600000).toISOString(), s1.version);
check('交班时间调整成功并升版本', adj1.ok && (adj1 as any).data.version === s1.version + 1);
const curShiftVer = a.shifts.find(s => s.id === 's1')!.version;
const adj2 = a.adjustShift('s1', new Date(Date.now() + 9 * 3600000).toISOString(), s1.version);
check('旧基线调整冲突', !adj2.ok && adj2.code === 'conflict' && adj2.current.version === curShiftVer);
const adjBad = a.adjustShift('s1', new Date(new Date(a.shifts.find(s => s.id === 's1')!.startedAt).getTime() - 1000).toISOString(), curShiftVer);
check('交班时间早于开班被业务校验拒绝', !adjBad.ok && adjBad.code === 'invalid');

console.log('\n[7] 交接提交：存在未确认遗留事项时阻止');
const rec = a.records.find(r => r.shiftId === 's1')!;
const sub1 = a.submitHandover('s1', '尝试提交', rec.version);
check('有未确认事项时不能提交交接', !sub1.ok && sub1.code === 'invalid' && sub1.message.includes('遗留事项'));
// 确认全部事项
for (const it of a.shiftItems('s1')) {
  if (!it.confirmed) {
    const r = a.saveItem(it.id, { confirmed: true }, it.version);
    if (!r.ok) throw new Error('确认事项失败: ' + JSON.stringify(r));
  }
}
check('全部事项已确认', a.pendingConfirmCount === 0);
const recV = a.records.find(r => r.shiftId === 's1')!.version;
const sub2 = a.submitHandover('s1', '白班运行正常，交接。', recV);
check('提交交接成功', sub2.ok && (sub2 as any).data.status === 'submitted');
check('班次状态变为待交接确认', a.shifts.find(s => s.id === 's1')!.status === 'pending_handover');

console.log('\n[8] 确认交接后归档为只读');
const recV2 = a.records.find(r => r.shiftId === 's1')!.version;
const conf = a.confirmHandover('s1', recV2);
check('确认交接成功并归档', conf.ok && (conf as any).data.status === 'confirmed');
check('班次已归档且有实际交班时间',
  a.shifts.find(s => s.id === 's1')!.status === 'handed_over' &&
  !!a.shifts.find(s => s.id === 's1')!.actualEndAt);
const afterArchive = a.saveItem('i1', { title: '试图改历史' }, 5);
check('归档后历史事项只读', !afterArchive.ok && afterArchive.code === 'invalid');
const adjArchive = a.adjustShift('s1', new Date().toISOString(), 99);
check('归档后不能调整交班时间', !adjArchive.ok);
// 更早的班次（种子 s0）位于只读历史归档列表；刚归档的 s1 作为当前视图只读展示
check('更早的班次在只读历史归档列表中', a.historyShifts.some(s => s.id === 's0'));
check('历史归档中的事项与记录仍可查看', a.shiftItems('s0').length === 1 && a.recordOf('s0')?.status === 'confirmed');

console.log('\n[9] 退出重进：角色与数据从 localStorage 恢复（标签页 B）');
const piniaB = createPinia();
const b = useDutyStore(piniaB);
check('重载后角色仍为当班负责人', b.currentRole === 'leader');
check('重载后班次已归档状态保持', b.shifts.find(s => s.id === 's1')!.status === 'handed_over');
check('重载后事项版本保持（v5）', b.items.find(i => i.id === 'i1')!.version === 5);

console.log('\n[10] 跨终端角色变更：storage 事件即时同步到本页面');
// 模拟另一终端把角色切成访客并写入新快照
const snapshot = JSON.parse(storageMap.get('iot-duty-state-v1')!);
snapshot.currentRole = 'visitor';
storageMap.set('iot-duty-state-v1', JSON.stringify(snapshot));
// 触发 B 页面内注册的 storage 监听（真实场景由浏览器在其它标签页写入时派发）
const handler = listeners[listeners.length - 1];
handler({ key: 'iot-duty-state-v1', newValue: JSON.stringify(snapshot) });
check('B 页面角色即时变为访客', b.currentRole === 'visitor');
check('B 页面值班入口权限即时收回', b.canManage === false);
check('交接状态仍保持已归档（数据同步未丢）', b.shifts.find(s => s.id === 's1')!.status === 'handed_over');
check('访客在 B 页面操作同样被拒并说明原因', !b.assignAssignee('i2', null, b.items.find(i => i.id === 'i2')!.version).ok);

console.log('\n[11] 管理员保留值班管理能力');
b.setRole('admin');
check('管理员可管理值班', b.canManage === true);
// 新增一个新当班以便管理员可写（s1 已归档的记录仍只读）
const adminDeny = b.saveItem('i1', { title: '改归档' }, 5);
check('管理员同样不能改已归档历史（隔离性）', !adminDeny.ok && adminDeny.code === 'invalid');
const now = Date.now();
b.shifts.push({
  id: 's2', name: '管理员新开班', leaderId: 'u1', memberIds: ['u1', 'u2'],
  startedAt: new Date(now).toISOString(), plannedEndAt: new Date(now + 3600000).toISOString(),
  actualEndAt: null, status: 'ongoing', version: 1,
});
b.records.push({ id: 'r2', shiftId: 's2', summary: '', status: 'draft', submittedAt: null, confirmedAt: null, version: 0 });
const addRes = b.addItem({ title: '管理员新增事项', detail: 'x', assigneeId: null });
check('管理员在当前班可新增事项', addRes.ok);
check('管理员操作不影响既有历史记录数量', b.records.filter(r => r.shiftId === 's0' || r.shiftId === 's1').length === 2);

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
