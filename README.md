# solo-6600009 - IoT Geofence Monitor

## Tech
- **Frontend**: Vue 3 + Pinia + Leaflet
- **Backend**: Go + Gin + MQTT
- **Database**: TimescaleDB

## Start
```bash
cd backend && go run main.go
cd frontend && npm install && npm run dev
```

## 值班与交接（受控权限）
左侧导航 🔄 入口。页面顶部可切换身份进行演示，选择即时生效并持久化（localStorage，退出重进保持；多标签页通过 storage 事件即时同步）：

- **当班负责人**：分配处理人、调整交接班时间、确认遗留事项、提交/确认交接班记录。
- **访客**：只能查看当班安排与交接记录；所有受控操作按钮仍可点击，点击后在页面顶部反馈条/弹窗中说明无权原因，不会静默无反应。
- **管理员**：原有能力不变，同时可管理值班模块；已归档的历史交接记录对任何角色只读。

### 并发控制
交接事项、班次交班时间、交接记录均带 `version` 乐观锁：保存必须携带打开时的基线版本。两人同时修改同一事项时只有先保存的一方生效，冲突方收到 `conflict` 结果，弹窗以"打开时 / 对方已保存 / 我尝试保存"三列展示差异，并可选择"采用最新内容重试"或"保留我的修改合并"。

验证方式（无需浏览器，Node 逻辑测试覆盖鉴权/持久化/跨终端同步/乐观锁/归档只读）：
```bash
cd frontend
node node_modules/typescript/bin/tsc -p tsconfig.test.json
echo '{"type":"commonjs"}' > scripts-test-build/package.json
node scripts-test-build/scripts-test/duty-logic.js
```
界面内也可打开任一交接事项后点击"🧪 模拟他人在其他终端抢先保存"直接体验冲突差异与重试流程（或直接开两个浏览器标签页真实操作）。

