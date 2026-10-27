// Tiện ích cho biểu đồ: giảm số điểm, chọn thang trục Y "đẹp", định dạng giờ.

// series: [{ t, v }] (v có thể null). Gộp trung bình theo nhóm để vẽ tối đa maxPoints điểm.
export function downsampleSeries(series, maxPoints = 72) {
  const n = series.length;
  if (n <= maxPoints) return series;
  const size = n / maxPoints;
  const out = [];
  for (let b = 0; b < maxPoints; b++) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.floor((b + 1) * size));
    let sum = 0;
    let cnt = 0;
    let t = series[start].t;
    for (let i = start; i < end && i < n; i++) {
      const v = series[i].v;
      if (v !== null && v !== undefined) {
        sum += v;
        cnt++;
      }
      t = series[i].t;
    }
    out.push({ t, v: cnt ? sum / cnt : null });
  }
  return out;
}

// Thang Y tự co giãn theo dữ liệu nhưng không vượt [min, max] và không hẹp hơn minSpan.
export function niceRange(values, min, max, minSpan) {
  const real = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  let lo = min;
  let hi = max;

  if (real.length) {
    const dMin = Math.min(...real);
    const dMax = Math.max(...real);
    const pad = Math.max((dMax - dMin) * 0.25, minSpan * 0.15);
    lo = dMin - pad;
    hi = dMax + pad;

    if (hi - lo < minSpan) {
      const mid = (lo + hi) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }

    lo = Math.max(min, lo);
    hi = Math.min(max, hi);

    if (hi - lo < minSpan) {
      if (lo <= min) hi = Math.min(max, lo + minSpan);
      else lo = Math.max(min, hi - minSpan);
    }
  }

  const raw = (hi - lo) / 4 || 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => (hi - lo) / s <= 5) || pow * 10;

  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  if (hi === lo) hi = lo + step;

  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks, step };
}

export function formatTick(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatTime(tSec, withSeconds = false) {
  if (!tSec) return '';
  const d = new Date(tSec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return withSeconds ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : `${p(d.getHours())}:${p(d.getMinutes())}`;
}
