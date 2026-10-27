import { C } from '../styles';

// Chuoi nay duoc PlantsScreen ghi khi vua ghep cay, truoc khi ESP32 gui du lieu that.
export const WAITING_STATUS = 'Đang chờ ESP32 gửi dữ liệu';

// Firmware gui trang thai khong dau (de hien thi tren LCD) -> map sang tieng Viet co dau.
const STATUS_MAP = {
  'Tot': { label: 'Tốt', color: C.green },
  'Can tuoi': { label: 'Cần tưới', color: C.red },
  'Dat qua am': { label: 'Đất quá ẩm', color: C.blue },
  'Cam bien khong on dinh': { label: 'Cảm biến không ổn định', color: C.orange },
  [WAITING_STATUS]: { label: 'Chờ dữ liệu', color: C.gray },
};

export function statusInfo(status) {
  return STATUS_MAP[status] || { label: status || '...', color: C.gray };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Chuan hoa current_data de app hien thi GIONG phan cung (LCD / Serial):
 *  - DHT loi        -> "Loi doc"        (LCD: "DHT: Loi doc")
 *  - Muc nuoc nhieu -> "Khong on dinh"  (LCD: "Khong on dinh!")
 *  - Nhiet do / do am khong khi: 1 chu so thap phan
 *  - Do am dat / anh sang / muc nuoc: so nguyen
 */
export function parseSensor(cd) {
  const d = cd || {};
  // Chi coi la du lieu that khi do ESP32 gui (co source === 'esp32').
  // So go tay trong Firebase Console khong co dau nay -> bi bo qua.
  const hasData = !!cd && d.source === 'esp32' && d.status !== WAITING_STATUS && num(d.last_updated) > 0;

  const temp = num(d.temperature);
  const hum = num(d.humidity);
  // Ban cu cua firmware khong co dht_ok: 0 va 0 nghia la doc loi.
  const dhtOk = d.dht_ok === false ? false : d.dht_ok === true ? true : !(temp === 0 && hum === 0);
  const waterOk = d.water_ok !== false && d.status !== 'Cam bien khong on dinh';

  const st = statusInfo(hasData ? d.status : WAITING_STATUS);
  return {
    hasData,
    dhtOk,
    waterOk,
    status: d.status,
    statusLabel: st.label,
    statusColor: st.color,
    soil: hasData ? `${num(d.soil_moisture) ?? '--'}%` : '--',
    light: hasData ? `${num(d.light) ?? '--'}%` : '--',
    temp: !hasData ? '--' : dhtOk && temp !== null ? `${temp.toFixed(1)}°C` : 'Lỗi đọc',
    hum: !hasData ? '--' : dhtOk && hum !== null ? `${hum.toFixed(1)}%` : 'Lỗi đọc',
    water: !hasData ? '--' : waterOk ? `${num(d.water_level) ?? '--'}%` : 'Không ổn định',
    soilNumber: hasData ? num(d.soil_moisture) : null,
  };
}

// Gia tri hien tai cua mot cam bien (dung cho phan bieu do trong man chi tiet).
export function currentSensorText(cd, key) {
  const p = parseSensor(cd);
  return { soil_moisture: p.soil, temperature: p.temp, humidity: p.hum, light: p.light, water_level: p.water }[key] ?? '--';
}

// Diem lich su khong hop le -> null de bieu do bo qua (khong ve thanh 0).
export function historyValue(item, key) {
  if (!item || item.source !== 'esp32') return null;
  if ((key === 'temperature' || key === 'humidity') && item.dht_ok === false) return null;
  if (key === 'water_level' && (item.water_ok === false || item.status === 'Cam bien khong on dinh')) return null;
  const n = num(item[key]);
  if ((key === 'temperature' || key === 'humidity') && item.dht_ok === undefined && n === 0 && num(item.humidity) === 0) return null;
  return n;
}
