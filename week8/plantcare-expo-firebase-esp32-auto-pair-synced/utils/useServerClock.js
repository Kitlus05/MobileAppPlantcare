import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebaseConfig';

// Gio hien tai (giay) theo server Firebase, tu cap nhat moi 5 giay.
// Dung de tinh "du lieu cap nhat cach day bao lau" ma khong phu thuoc dong ho dien thoai.
export function useServerClock() {
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => onValue(ref(db, '.info/serverTimeOffset'), (s) => setOffset(Number(s.val()) || 0)), []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return Math.floor((Date.now() + offset) / 1000);
}

export const STALE_AFTER_SEC = 30;

export function ageInfo(lastUpdatedSec, nowSec) {
  const last = Number(lastUpdatedSec);
  if (!Number.isFinite(last) || last <= 0) return { text: 'Chưa có dữ liệu', stale: true };
  const age = Math.max(0, nowSec - last);
  const text =
    age < 5 ? 'vừa xong' : age < 60 ? `${age} giây trước` : age < 3600 ? `${Math.floor(age / 60)} phút trước` : `${Math.floor(age / 3600)} giờ trước`;
  return { text, stale: age > STALE_AFTER_SEC };
}
