import { ref, update } from 'firebase/database';
import { db } from '../firebaseConfig';

// plants/{plantId}/control — app ghi, ESP32 đọc mỗi ~3 giây
//   water_now      : lệnh tưới ngay (ESP32 tự đặt lại false sau khi nhận)
//   updated_at     : thời điểm gửi lệnh (ms)
//   auto_watering  : tự tưới khi đất khô
//   auto_threshold : ngưỡng độ ẩm đất (%)
//   pump_seconds   : thời gian bơm mỗi lần (giây)
export const CONTROL_DEFAULTS = { auto_watering: false, auto_threshold: 30, pump_seconds: 5 };
export const THRESHOLD_RANGE = { min: 10, max: 70, step: 5 };
export const PUMP_SECONDS_RANGE = { min: 2, max: 30, step: 2 };

export function readControl(plant) {
  const c = plant?.control || {};
  return {
    auto_watering: c.auto_watering === true,
    auto_threshold: Number.isFinite(Number(c.auto_threshold)) ? Number(c.auto_threshold) : CONTROL_DEFAULTS.auto_threshold,
    pump_seconds: Number.isFinite(Number(c.pump_seconds)) ? Number(c.pump_seconds) : CONTROL_DEFAULTS.pump_seconds,
  };
}

export function sendWaterNow(plantId) {
  return update(ref(db, `plants/${plantId}/control`), { water_now: true, updated_at: Date.now() });
}

export function saveControl(plantId, patch) {
  return update(ref(db, `plants/${plantId}/control`), patch);
}
