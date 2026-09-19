export interface Device {
  id: string; name: string; lat: number; lng: number;
  status: 'online' | 'offline' | 'alert'; lastSeen: string;
  battery: number; temperature: number;
  groupId?: string;
  thresholds?: DeviceThresholds;
}

export interface DeviceThresholds {
  lowBattery: number;
  highTemperature: number;
  offlineTimeout: number;
}

export interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface DeviceRegistrationForm {
  name: string;
  lat: number;
  lng: number;
  battery: number;
  temperature: number;
  groupId?: string;
  thresholds: DeviceThresholds;
}

export interface Geofence {
  id: string; name: string;
  center: { lat: number; lng: number };
  radius: number; type: 'circle' | 'polygon';
  paths?: Array<{ lat: number; lng: number }>;
  alertOnEnter: boolean; alertOnExit: boolean; color: string;
}

export type AlertType = 'enter' | 'exit' | 'low_battery' | 'offline';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  deviceId: string;
  fenceId?: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: string;
  message: string;
  acknowledged: boolean;
}

export interface MqttMessage {
  topic: string; payload: string; timestamp: string;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number;
  battery?: number;
  temperature?: number;
  isAbnormal?: boolean;
  abnormalType?: 'fence_breach' | 'low_battery' | 'offline' | 'speed';
  abnormalMessage?: string;
}

export interface StayPoint {
  lat: number;
  lng: number;
  startTime: string;
  endTime: string;
  duration: number;
  name?: string;
}

export interface TrackSegment {
  points: TrackPoint[];
  isNormal: boolean;
  abnormalType?: string;
  startTime: string;
  endTime: string;
}

export interface TrackData {
  deviceId: string;
  deviceName: string;
  startTime: string;
  endTime: string;
  points: TrackPoint[];
  segments: TrackSegment[];
  stayPoints: StayPoint[];
  breachEvents: TrackPoint[];
  totalDistance: number;
  totalDuration: number;
}

export interface HealthDataPoint {
  timestamp: string;
  battery: number;
  temperature: number;
  isOnline: boolean;
}

export interface DeviceHealth {
  deviceId: string;
  deviceName: string;
  healthScore: number;
  batteryLevel: number;
  temperatureLevel: number;
  onlineHours: number;
  offlineHours: number;
  alertCount: number;
  healthTrend: 'improving' | 'stable' | 'declining';
  lastAbnormalTime?: string;
  lastAbnormalType?: AlertType;
  priorityRank: number;
  recommendations: string[];
  historyData: HealthDataPoint[];
}

export interface HealthSummary {
  avgHealthScore: number;
  totalAlertCount: number;
  avgOnlineRate: number;
  avgBatteryLevel: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
}

// ===== 值班与交接 =====
export type DutyRole = 'admin' | 'leader' | 'operator' | 'visitor';

export interface DutyUser {
  id: string;
  name: string;
  role: DutyRole;
}

export interface Shift {
  id: string;
  name: string;
  leaderId: string;
  startTime: string;
  endTime: string;
  status: 'ongoing' | 'closed';
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export type DutyItemStatus = 'pending' | 'in_progress' | 'done';

export interface DutyItem {
  id: string;
  shiftId: string;
  title: string;
  detail: string;
  assigneeId: string | null;
  status: DutyItemStatus;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export type HandoverStatus = 'pending' | 'completed';

export interface CarryoverItem {
  id: string;
  title: string;
  detail: string;
  status: 'pending' | 'resolved';
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface Handover {
  id: string;
  shiftId: string;
  fromShiftName: string;
  summary: string;
  status: HandoverStatus;
  handoverTime: string | null;
  carryovers: CarryoverItem[];
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface DutyState {
  shifts: Shift[];
  items: DutyItem[];
  handovers: Handover[];
}

/** 字段级差异：用于并发冲突时展示冲突双方内容 */
export interface FieldDiff {
  field: string;
  label: string;
  base: string;
  yours: string;
  theirs: string;
}

export interface DutyConflict {
  code: 'conflict';
  message: string;
  entity: 'shift' | 'item' | 'handover' | 'carryover';
  id: string;
  server: Shift | DutyItem | Handover | CarryoverItem;
  attempted: Record<string, unknown>;
  diffs: FieldDiff[];
}

export interface DutyForbidden {
  code: 'forbidden';
  message: string;
  reason: string;
}

export type DutyResult<T> =
  | { ok: true; data: T }
  | DutyForbidden
  | { code: 'invalid'; message: string }
  | DutyConflict;
