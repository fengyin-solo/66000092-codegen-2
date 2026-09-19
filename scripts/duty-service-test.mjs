// 服务层语义测试：权限、持久化、乐观锁冲突、重试
//
// 运行前先把 TS 转译为 JS（输出到 frontend/.testbuild）：
//   cd frontend && node_modules/.bin/tsc src/services/dutyService.ts src/types/index.ts \
//     --outDir .testbuild --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
// 然后：node scripts/duty-service-test.mjs
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceUrl = path.join(__dirname, '..', 'frontend', '.testbuild', 'services', 'dutyService.js');

// ---- localStorage + window 模拟 ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
const storageListeners = [];
globalThis.window = {
  addEventListener: (type, fn) => { if (type === 'storage') storageListeners.push(fn); },
};

const { dutyService } = await import(serviceUrl);

const LEADER = 'u2';   // 李敏 当班负责人
const LEADER2 = 'u5';  // 周婷 当班负责人（另一个人）
const VISITOR = 'u4';  // 孙倩 访客
const ADMIN = 'u1';    // 王强 管理员
const OPERATOR = 'u3'; // 赵磊 值班员

async function fresh() {
  mem.clear();
  storageListeners.length = 0;
  // 重新加载模块以触发种子数据
  const mod = await import(`${serviceUrl}?fresh=${Date.now()}-${Math.random()}`);
  return mod.dutyService;
}

let svc = await fresh();
let s = svc.getState();
assert.equal(s.shifts.length, 2, 'seed: 2 shifts');
assert.equal(s.items.length, 3, 'seed: 3 items');
assert.equal(s.handovers.length, 2, 'seed: 2 handovers');

// 1) 访客只读：所有写操作被拒绝并带原因
let r = svc.updateShift(VISITOR, 's1', { startTime: new Date().toISOString() }, 1);
assert.equal(r.code, 'forbidden', 'visitor cannot adjust shift');
assert.match(r.reason, /访客/, 'forbidden includes reason text');

r = svc.updateDutyItem(VISITOR, 'i2', { assigneeId: 'u3' }, 1);
assert.equal(r.code, 'forbidden', 'visitor cannot assign');

const h1 = svc.getState().handovers.find(h => h.id === 'h1');
const c1 = h1.carryovers.find(c => c.id === 'c1');
r = svc.updateCarryover(VISITOR, 'h1', 'c1', { status: 'resolved' }, c1.version);
assert.equal(r.code, 'forbidden', 'visitor cannot confirm carryover');

// 值班员同样不可写
r = svc.updateDutyItem(OPERATOR, 'i2', { assigneeId: 'u3' }, 1);
assert.equal(r.code, 'forbidden', 'operator cannot assign');

// 2) 负责人成功分配处理人，版本+1，持久化
r = svc.updateDutyItem(LEADER, 'i2', { assigneeId: OPERATOR }, 1);
assert.equal(r.ok, true);
assert.equal(r.data.assigneeId, OPERATOR);
assert.equal(r.data.version, 2, 'version increments');

// 持久化：新"会话"读取同一 localStorage 得到版本 2
const persisted = JSON.parse(mem.get('iot-duty-state-v1'));
assert.equal(persisted.items.find(i => i.id === 'i2').version, 2, 'persisted across reload');

// 3) 两人同时改同一事项：只保存一次
// 第二个人仍基于版本 1 提交（另一个标签页尚未刷新）
r = svc.updateDutyItem(LEADER2, 'i2', { assigneeId: LEADER2 }, 1);
assert.equal(r.code, 'conflict', 'second concurrent save is rejected');
assert.equal(r.entity, 'item');
assert.equal(r.diffs.length, 1);
assert.equal(r.diffs[0].field, 'assigneeId');
assert.equal(r.diffs[0].yours, '周婷');
assert.equal(r.diffs[0].theirs, '赵磊');
assert.equal(r.server.version, 2, 'conflict response carries server version');

// 4) 冲突后用我的修改重试（基于服务器最新版本号）→ 成功，只保存一次
r = svc.updateDutyItem(LEADER2, 'i2', { assigneeId: LEADER2 }, r.server.version);
assert.equal(r.ok, true, 'retry on latest version succeeds');
assert.equal(r.data.assigneeId, LEADER2);
assert.equal(r.data.version, 3);

// 重试后再以旧版本保存仍冲突
r = svc.updateDutyItem(LEADER, 'i2', { assigneeId: OPERATOR }, 1);
assert.equal(r.code, 'conflict');

// 5) 遗留事项确认
s = svc.getState();
let carry = s.handovers.find(h => h.id === 'h1').carryovers.find(c => c.id === 'c1');
assert.equal(carry.status, 'pending');
r = svc.updateCarryover(LEADER, 'h1', 'c1', { status: 'resolved' }, carry.version);
assert.equal(r.ok, true);
assert.equal(r.data.confirmedBy, LEADER);
assert.ok(r.data.confirmedAt);

// 并发确认同一遗留事项只能一次
r = svc.updateCarryover(LEADER2, 'h1', 'c1', { status: 'pending' }, carry.version);
assert.equal(r.code, 'conflict', 'carryover confirm is guarded too');
assert.equal(r.entity, 'carryover');

// 6) 仍有待确认遗留时不能完成交接
s = svc.getState();
let h1v = s.handovers.find(h => h.id === 'h1').version;
r = svc.updateHandover(LEADER, 'h1', { status: 'completed' }, h1v);
assert.equal(r.ok, true, 'no pending carryovers -> can complete');

// 重新打开一个遗留事项后，完成交接被阻止
s = svc.getState();
h1v = s.handovers.find(h => h.id === 'h1').version;
carry = s.handovers.find(h => h.id === 'h1').carryovers.find(c => c.id === 'c1');
r = svc.updateCarryover(LEADER2, 'h1', 'c1', { status: 'pending' }, carry.version);
assert.equal(r.ok, true, 'reopen carryover');
r = svc.updateHandover(LEADER, 'h1', { status: 'completed' }, h1v);
assert.equal(r.code, 'invalid');
assert.match(r.message, /遗留事项/);

// 7) 管理员保留原有能力
svc = await fresh();
r = svc.updateShift(ADMIN, 's1', { startTime: new Date(Date.now() + 3600_000).toISOString() }, 1);
assert.equal(r.ok, true, 'admin can adjust shift');
r = svc.updateDutyItem(ADMIN, 'i2', { assigneeId: OPERATOR }, 1);
assert.equal(r.ok, true, 'admin can assign');

// 管理员/负责人都受乐观锁约束（管理员不能覆盖他人刚保存的修改）
r = svc.updateDutyItem(ADMIN, 'i2', { assigneeId: LEADER2 }, 1);
assert.equal(r.code, 'conflict', 'admin also gets conflict on stale version');

// 其他记录不受影响：i1、i3 仍为版本 1
s = svc.getState();
assert.equal(s.items.find(i => i.id === 'i1').version, 1, 'other records untouched');
assert.equal(s.items.find(i => i.id === 'i3').version, 1, 'other records untouched');
assert.equal(s.handovers.find(h => h.id === 'h2').version, 1, 'history handover untouched');

// 8) 时间校验
r = svc.updateShift(LEADER, 's1', {
  startTime: new Date('2026-01-02T00:00:00Z').toISOString(),
  endTime: new Date('2026-01-01T00:00:00Z').toISOString(),
}, s.shifts.find(x => x.id === 's1').version);
assert.equal(r.code, 'invalid', 'end before start rejected');

// 9) 跨标签页同步：写入后 storage 监听被触发
svc = await fresh();
svc.updateDutyItem(LEADER, 'i3', { assigneeId: OPERATOR }, 1);
// persist 不会自己派发 storage 事件（浏览器语义下是另一个文档触发），
// 这里验证监听器已注册，事件到达即刷新
assert.equal(storageListeners.length, 1, 'storage listener registered');
const next = JSON.parse(mem.get('iot-duty-state-v1'));
assert.equal(next.items.find(i => i.id === 'i3').assigneeId, OPERATOR);

console.log('ALL DUTY SERVICE TESTS PASSED');
