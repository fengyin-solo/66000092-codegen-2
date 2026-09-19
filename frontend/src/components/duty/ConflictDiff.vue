<template>
  <div :style="cardStyle">
    <div :style="headerStyle">⚠️ 保存冲突：该事项已被其他人保存</div>
    <div style="font-size:12px;color:#c62828;line-height:1.6;margin-bottom:10px">
      {{ message }}<br/>
      同一项修改只保存了一次——对方的保存已生效，你的保存未写入。请对比差异后选择重试方式：
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
      <div v-for="f in fields" :key="f.label"
        :style="{ border:'1px solid #ffcdd2', borderRadius:'6px', overflow:'hidden' }">
        <div style="background:#ffebee;padding:4px 8px;font-size:12px;font-weight:600;color:#b71c1c">
          {{ f.label }}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tbody>
          <tr>
            <td :style="cellLabelStyle">你打开时</td>
            <td :style="cellStyle">{{ display(f.base) }}</td>
          </tr>
          <tr>
            <td :style="{ ...cellLabelStyle, background:'#e8f5e9', color:'#2e7d32' }">对方已保存（最新）</td>
            <td :style="{ ...cellStyle, background:'#f1f8e9' }">{{ display(f.current) }}</td>
          </tr>
          <tr>
            <td :style="{ ...cellLabelStyle, background:'#fff3e0', color:'#e65100' }">你尝试保存</td>
            <td :style="{ ...cellStyle, background:'#fff8e1' }">{{ display(f.attempt) }}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button @click="$emit('close')" :style="ghostBtnStyle">关闭</button>
      <button @click="$emit('keep-mine')" :style="warnBtnStyle"
        title="保留我填写的内容，并把版本基线更新为最新，随后可再次保存">
        保留我的修改并合并
      </button>
      <button @click="$emit('use-latest')" :style="primaryBtnStyle"
        title="放弃我的修改，表单载入对方保存的最新内容">
        采用最新内容重试
      </button>
    </div>
    <div style="font-size:11px;color:#888;margin-top:8px">
      最新版本号：v{{ latestVersion }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  latestVersion: number;
  fields: Array<{ label: string; base: string; current: string; attempt: string }>;
}>();

defineEmits<{
  (e: 'use-latest'): void;
  (e: 'keep-mine'): void;
  (e: 'close'): void;
}>();

function display(v: string) {
  return v && v.trim() !== '' ? v : '（空）';
}

const cardStyle = {
  border: '1px solid #e53935', borderRadius: '8px', padding: '12px',
  background: '#fff', marginTop: '10px',
};
const headerStyle = {
  fontSize: '13px', fontWeight: 700, color: '#c62828', marginBottom: '8px',
};
const cellLabelStyle = {
  width: '110px', padding: '4px 8px', color: '#888',
  borderBottom: '1px solid #f0f0f0', verticalAlign: 'top', whiteSpace: 'nowrap',
} as const;
const cellStyle = {
  padding: '4px 8px', borderBottom: '1px solid #f0f0f0',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333',
} as const;
const primaryBtnStyle = {
  padding: '6px 12px', borderRadius: '6px', border: 'none',
  background: '#1b5e20', color: '#fff', cursor: 'pointer', fontSize: '12px',
};
const warnBtnStyle = {
  padding: '6px 12px', borderRadius: '6px', border: '1px solid #ef6c00',
  background: '#fff3e0', color: '#e65100', cursor: 'pointer', fontSize: '12px',
};
const ghostBtnStyle = {
  padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc',
  background: '#fff', color: '#666', cursor: 'pointer', fontSize: '12px',
};
</script>
