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
