# Patch notes — Rules + App discovery + firmware registration

## Contract thống nhất

- `devices/{deviceId}`: registry riêng tư của firmware.
  - Firmware anonymous UID mới được tạo/refresh và giữ trong NVS.
  - App chỉ được claim/unclaim bằng Firebase Auth user.
  - `device_uid` không được đổi sau khi đăng ký.
- `device_public/{deviceId}`: discovery cho user đã đăng nhập.
  - Chỉ chứa `device_id`, `last_seen`, `online`, `claimable`.
  - Firmware cập nhật heartbeat; App dùng nó để discovery.
- `plants/{plantId}`: resource thuộc user.
  - App tạo/xóa metadata.
  - `current_data` chỉ anonymous firmware của device đang được claim mới ghi được.
  - `commands` chỉ owner ghi.
- `sensor_history/{plantId}`: chỉ firmware của device đang map vào plant mới ghi.

## Sửa chính

1. Rules không còn cho owner ghi đè `current_data` thông qua quyền `.write` ở parent `plants`.
2. Claim race được khóa ở `devices`: chỉ một user claim được khi `claimable === true`.
3. App discovery chỉ hiện thiết bị `claimable`, `online` và có `last_seen` trong 30 giây gần nhất.
4. Firmware registration dùng PATCH để không làm mất `owner_uid/plant_id` khi device đã được claim.
5. Firmware kiểm tra `device_uid` trước khi ghi registry; nếu cùng `DEVICE_ID` nhưng UID khác thì không tự chiếm thiết bị.
6. App vẫn cập nhật `device_public.claimable=false` trong atomic claim; firmware heartbeat tiếp tục đồng bộ trạng thái.
7. Khi unclaim, App trả `devices.owner_uid/plant_id` về null + `claimable=true`; firmware đọc lại `plant_id` rỗng và public discovery quay lại.

## Lưu ý

Nếu xóa NVS/erase flash của một ESP32 đã đăng ký, Anonymous UID mới sẽ khác UID cũ. Firmware cố tình KHÔNG tự overwrite registry để tránh thiết bị khác chiếm `DEVICE_ID`. Khi đó cần xóa/reset registry của device cũ trước khi đăng ký lại.

## Các file đã sửa

- `database.rules.json`
- `screens/PlantsScreen.js`
- `PlantCare_Firebase_ESP32.ino`

---

# Patch 2 — sửa lỗi "Thêm cây" không thấy ESP32

## Nguyên nhân chính
- App lắng nghe `/device_public` (node cha) nhưng Rules chỉ cho đọc ở `device_public/$deviceId`. Quyền đọc không đi ngược lên node cha → **permission denied**, danh sách luôn rỗng.
- Claim bị chặn bởi `.validate` của `devices` (không cho `owner_uid`/`plant_id` đi từ trống → có giá trị) và bởi việc app ghi `device_public.claimable=false` (Rules không cho). Unclaim cũng bị chặn tương tự.
- Firmware chỉ gọi `registerDevice()` một lần lúc khởi động; nếu lỗi (mạng/NTP) thì không bao giờ thử lại, heartbeat sau đó không tạo được node.
- Firmware coi mọi HTTP 401 là token hết hạn, kể cả "Permission denied".

## Đã sửa
- `database.rules.json`: thêm `.read` ở `device_public`; sửa claim/unclaim; app không còn ghi `device_public` (firmware tự đồng bộ trong ~5 giây); `plants` cha chỉ tạo/xóa, sửa từng trường qua rule con; thêm rule cho `notifications`, `diagnosis_history`.
- Firmware: chờ NTP, thử đăng ký lại đến khi thành công, không reset token khi Permission denied.
- App: so sánh `last_seen` theo giờ server Firebase, tự làm mới mỗi 5 giây, hiển thị lý do/lỗi cụ thể thay vì câu chung chung; Lịch sử/Thông báo không quay spinner mãi khi bị từ chối.

## Bắt buộc làm sau khi nhận bản này
1. `firebase deploy --only database` (hoặc dán `database.rules.json` vào Console → Realtime Database → Rules → Publish).
2. Nạp lại firmware cho ESP32.
3. Firebase Console → Authentication → bật **Anonymous** và **Email/Password**.

---

# Patch 3 — app hiển thị giống phần cứng (LCD / Serial)

- `utils/sensors.js` (mới): chuẩn hóa `current_data` cho mọi màn hình.
  - Nhiệt độ / độ ẩm không khí: 1 chữ số thập phân; DHT lỗi → "Lỗi đọc" (LCD: "DHT: Loi doc").
  - Mực nước nhiễu → "Không ổn định" (LCD: "Khong on dinh!").
  - Trạng thái không dấu của firmware → tiếng Việt có dấu + màu (Tốt / Cần tưới / Đất quá ẩm / Cảm biến không ổn định).
  - Cây vừa ghép, chưa có dữ liệu thật → "--" thay vì 0.
- Firmware gửi thêm `dht_ok`, `water_ok` (current_data + sensor_history); chu kỳ gửi 10s → 5s.
- Biểu đồ bỏ qua điểm lỗi thay vì vẽ về 0.
- Thẻ cây hiện trạng thái thật thay cho dòng cố định "Đang phát triển".

---

# Patch 4 — nút bấm không phản hồi

Nguyên nhân: mọi thao tác Firebase (HTTPS) chạy trong `loop()` và mỗi lần mất 1–3 giây; sau khi rút chu kỳ gửi còn 5 giây, `loop()` gần như luôn bị chặn nên lần nhấn nút bị bỏ lỡ.

Sửa: nút bấm dùng ngắt phần cứng (FALLING, chống dội 200 ms); toàn bộ Wi‑Fi/Firebase chạy trong task riêng trên core 0; `loop()` chỉ đọc cảm biến, làm mới LCD, xử lý nút. Dữ liệu chia sẻ qua mutex. Chu kỳ heartbeat/đồng bộ 5s → 10s.

---

# Patch 5 — Cài đặt (lịch tưới, nhắc nhở, tự động tưới), Trang chủ cân đối, biểu đồ + tốc độ

## App
- **Cài đặt**: mỗi nhóm là một thẻ bo góc, công tắc căn giữa dòng. Mục mới:
  - *Nhắc tưới cây* (bật/tắt, xin quyền thông báo).
  - *Lịch tưới cây*: chọn ngày trong tuần + tối đa 4 giờ nhắc/ngày (thông báo cục bộ hằng tuần). Lưu tại `users/{uid}/settings`.
  - *Tự động tưới*: bật/tắt, ngưỡng độ ẩm đất (10–70%), số giây bơm (2–30s). Lưu tại `plants/{id}/control`.
- **Trang chủ**: "Thông tin nhanh" dùng thẻ độ ẩm đất lớn + lưới 2×2 (không còn 5 thẻ chật một hàng).
- **Biểu đồ** (chi tiết cây): chọn 1 giờ / 6 giờ / 24 giờ; chỉ tải đúng đoạn cần (orderByKey + startAt); thêm điểm "trực tiếp" từ `current_data` (3 giây) nên đường biểu đồ chạy realtime; giảm còn ≤ 72 điểm; nhãn giờ ở trục X.
- **Tưới ngay** ghi `plants/{id}/control/water_now`, hiện "Đang tưới..." theo `pump_status`.
- Cảnh báo "Cây cần tưới" hiện ngay khi app đang mở (cooldown 30 phút/cây).

## Firmware
- Giữ kết nối TLS (keep-alive) → mỗi request ~100–300 ms thay vì 1–2 s. Gửi `current_data` mỗi 3 s; hỏi lệnh điều khiển mỗi 3 s; chưa ghép thì hỏi gán cây mỗi 3 s (ghép xong nhận ngay).
- Heartbeat chỉ 1 request (device_public) mỗi 10 s.
- Bơm: `PUMP_PIN` (mặc định -1 = tắt) và `PUMP_ACTIVE_LOW`. Hỗ trợ *Tưới ngay* và *Tự động tưới* (nghỉ ≥ 15 phút giữa hai lần). Bơm chạy không chặn, gửi `pump_status`, `pump_ready`.

## Rules
- Thêm `plants/{id}/control`: chủ cây ghi; firmware đọc và chỉ được đặt lại `water_now`.

## Cần làm
1. `npm install` rồi `npx expo install expo-notifications` (thông báo cục bộ).
2. Publish `database.rules.json` mới.
3. Nạp lại firmware. Muốn dùng bơm: đặt `PUMP_PIN`, `PUMP_ACTIVE_LOW` đúng với relay của bạn.
