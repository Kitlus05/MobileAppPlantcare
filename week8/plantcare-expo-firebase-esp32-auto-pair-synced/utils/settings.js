// Cài đặt người dùng lưu tại users/{uid}/settings
//   reminder_enabled : bật/tắt mọi nhắc nhở tưới cây
//   schedule.enabled : bật lịch tưới
//   schedule.days    : chuỗi 7 ký tự "1111111" (T2..CN)
//   schedule.times   : chuỗi "07:00,17:00"
// (dùng chuỗi thay vì mảng vì Firebase xóa mảng rỗng / đổi mảng thành object)

export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const MAX_TIMES = 4;

export const DEFAULT_SETTINGS = {
  reminder_enabled: true,
  schedule: { enabled: false, days: [true, true, true, true, true, true, true], times: ['07:00', '17:00'] },
};

export function normalizeSettings(raw) {
  const r = raw || {};
  const sch = r.schedule || {};

  const daysStr = typeof sch.days === 'string' ? sch.days : '1111111';
  const days = Array.from({ length: 7 }, (_, i) => daysStr[i] !== '0');

  const times =
    typeof sch.times === 'string'
      ? sch.times.split(',').map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t))
      : DEFAULT_SETTINGS.schedule.times;

  return {
    reminder_enabled: r.reminder_enabled !== false,
    schedule: { enabled: sch.enabled === true, days, times: normalizeTimes(times) },
  };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function normalizeTimes(times) {
  const fixed = (times || []).map((t) => {
    const [h, m] = String(t).split(':').map(Number);
    return `${pad2(Math.min(23, Math.max(0, h || 0)))}:${pad2(Math.min(59, Math.max(0, m || 0)))}`;
  });
  return [...new Set(fixed)].sort().slice(0, MAX_TIMES);
}

export function serializeSchedule(s) {
  return {
    enabled: !!s.enabled,
    days: s.days.map((d) => (d ? '1' : '0')).join(''),
    times: normalizeTimes(s.times).join(','),
  };
}

export function summarizeSchedule(s) {
  if (!s.enabled) return 'Đang tắt';
  if (s.times.length === 0) return 'Chưa chọn giờ';
  const all = s.days.every(Boolean);
  const names = all ? 'Hằng ngày' : s.days.map((d, i) => (d ? DAY_LABELS[i] : null)).filter(Boolean).join(', ') || 'Chưa chọn ngày';
  return `${names} • ${s.times.join(', ')}`;
}
