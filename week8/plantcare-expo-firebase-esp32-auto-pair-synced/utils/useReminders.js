import { useEffect, useRef } from 'react';
import { usePlants } from './usePlants';
import { applyWateringSchedule, notifyNow, configureNotifications } from './reminders';
import { parseSensor } from './sensors';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // nhắc lại tối đa 30 phút/lần cho mỗi cây
const FRESH_SEC = 120;                      // chỉ cảnh báo khi dữ liệu còn mới

// Gắn 1 lần ở gốc app (sau khi đăng nhập):
//  1) Đồng bộ lịch nhắc tưới (thông báo cục bộ hằng tuần) theo cài đặt trên Firebase.
//  2) Khi app đang mở và cây "Cần tưới" -> hiện thông báo ngay.
export function useReminders(user) {
  const { plants, settings } = usePlants(user);
  const lastAlert = useRef({});

  useEffect(() => {
    configureNotifications();
  }, []);

  const scheduleKey = JSON.stringify([settings.reminder_enabled, settings.schedule]);
  useEffect(() => {
    if (!user) return;
    applyWateringSchedule({
      enabled: settings.reminder_enabled && settings.schedule.enabled,
      days: settings.schedule.days,
      times: settings.schedule.times,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scheduleKey]);

  useEffect(() => {
    if (!settings.reminder_enabled) return;
    const nowSec = Date.now() / 1000;

    Object.entries(plants).forEach(([id, plant]) => {
      const cd = plant?.current_data;
      const sv = parseSensor(cd);
      const needsWater = sv.hasData && cd.status === 'Can tuoi' && nowSec - Number(cd.last_updated) < FRESH_SEC;

      if (!needsWater) {
        delete lastAlert.current[id];     // hết khô -> lần sau khô lại sẽ nhắc ngay
        return;
      }

      const last = lastAlert.current[id] || 0;
      if (Date.now() - last >= ALERT_COOLDOWN_MS) {
        lastAlert.current[id] = Date.now();
        notifyNow('Cây cần tưới 💧', `${plant.name || 'Cây của bạn'}: độ ẩm đất chỉ còn ${sv.soil}.`);
      }
    });
  }, [plants, settings.reminder_enabled]);
}
