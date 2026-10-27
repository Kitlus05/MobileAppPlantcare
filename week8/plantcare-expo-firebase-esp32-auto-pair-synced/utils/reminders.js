import { Platform } from 'react-native';

// expo-notifications là tùy chọn: chưa cài thì app vẫn chạy (chỉ không có thông báo đẩy cục bộ).
let Notifications = null;
try {
  // eslint-disable-next-line global-require
  Notifications = require('expo-notifications');
} catch (e) {
  Notifications = null;
}

export const remindersAvailable = !!Notifications;

const CHANNEL_ID = 'watering';
let configured = false;

export function configureNotifications() {
  if (!Notifications || configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Nhắc tưới cây',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  } catch (e) {
    console.log('configureNotifications error:', e);
  }
}

async function hasPermission() {
  if (!Notifications) return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    return !!(cur.granted || cur.status === 'granted');
  } catch (e) {
    return false;
  }
}

export async function ensurePermission() {
  if (!Notifications) return false;
  if (await hasPermission()) return true;
  try {
    const req = await Notifications.requestPermissionsAsync();
    return !!(req.granted || req.status === 'granted');
  } catch (e) {
    return false;
  }
}

// days: 7 boolean (T2..CN). Expo: weekday 1 = Chủ nhật ... 7 = Thứ bảy.
const expoWeekday = (i) => (i === 6 ? 1 : i + 2);

export async function applyWateringSchedule({ enabled, days, times }) {
  if (!Notifications) return 0;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.log('cancel schedule error:', e);
  }
  if (!enabled || !times?.length) return 0;
  if (!(await hasPermission())) return 0;

  const weekly = Notifications.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly';
  let count = 0;
  for (let d = 0; d < 7; d++) {
    if (!days?.[d]) continue;
    for (const t of times) {
      const [hour, minute] = t.split(':').map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Đến giờ tưới cây 💧',
            body: 'Kiểm tra và tưới nước cho cây của bạn nhé.',
            data: { type: 'watering_schedule' },
          },
          trigger: { type: weekly, weekday: expoWeekday(d), hour, minute, channelId: CHANNEL_ID },
        });
        count++;
      } catch (e) {
        console.log('schedule error:', e);
      }
    }
  }
  return count;
}

// Hiện thông báo ngay (không xin quyền ở đây; chỉ hiện nếu người dùng đã cho phép).
export async function notifyNow(title, body) {
  if (!Notifications || !(await hasPermission())) return false;
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data: { type: 'low_moisture' } }, trigger: null });
    return true;
  } catch (e) {
    return false;
  }
}

export function addReceivedListener(callback) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationReceivedListener(callback);
  return () => sub.remove();
}
