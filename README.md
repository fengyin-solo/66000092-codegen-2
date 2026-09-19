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
入口：左侧导航 🧑‍✈️。页面顶部可切换值班身份，选择会持久化（退出重进仍保持）。

| 角色 | 当班安排/交接记录 | 分配处理人 / 调整交接班 / 确认遗留事项 |
| --- | --- | --- |
| 管理员、当班负责人 | 查看 | 允许 |
| 值班员、访客 | 查看 | 拒绝，并在操作所在区块内说明原因 |

- **角色变更即时同步**：身份切换后，值班入口提示、按钮状态、交接状态立即按新角色生效。
- **并发只保存一次**：每条记录带 `version` 乐观锁。两个标签页（两名值班人员）同时编辑同一事项时，先保存者成功，后保存者收到冲突弹窗，左右对比「我的提交 / 服务器最新版本」的字段差异，可选择「用我的修改重试」或「采用最新版本」。
- **跨会话持久化**：值班安排、交接记录、当前身份存于 `localStorage`；多个标签页通过 `storage` 事件实时同步。
- 管理员既有能力与其他值班记录不受影响；冲突只针对被同时修改的那一条记录。

服务层语义（权限拒绝、版本递增、冲突差异、重试、遗留事项约束）测试：
```bash
cd frontend
node_modules/.bin/tsc src/services/dutyService.ts src/types/index.ts \
  --outDir .testbuild --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
cd .. && node scripts/duty-service-test.mjs
```
