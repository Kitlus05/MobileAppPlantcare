# PlantCare — App đăng nhập → tự tìm ESP32 → tự ghép → Firebase Realtime

Bản này đã bỏ hoàn toàn:

- `device Firebase email`
- `device Firebase password`
- `plant ID` hard-code trong firmware

Luồng mới:

```text
Người dùng đăng nhập App (Email/Password)
                 │
                 ▼
        App nghe /device_public
                 │
                 │ ESP32 tự đăng ký
                 ▼
ESP32 ── Anonymous Firebase Auth ──> /devices/{deviceId}
                 │
                 ▼
       App thấy "ESP32 đang chờ ghép"
                 │
                 ▼
      App tạo plant + claim device
                 │
                 ▼
 /users/{uid}/plant_ids
 /plants/{plantId}
 /devices/{deviceId}/plant_id
                 │
                 ▼
ESP32 tự đọc plant_id rồi gửi:
 /plants/{plantId}/current_data
 /sensor_history/{plantId}/{timestamp}
                 │
                 ▼
        App onValue() realtime
```

## 1. Cơ chế xác thực ESP32 mới

ESP32 không còn tài khoản Firebase dạng:

```text
esp32_001@plantcare.local
password
```

Thay vào đó firmware dùng **Firebase Anonymous Authentication**.

Lần đầu:

```text
accounts:signUp
      ↓
Firebase tạo anonymous UID
      ↓
ESP32 lưu refresh token + UID vào NVS (Preferences)
```

Các lần khởi động sau, firmware dùng refresh token để giữ nguyên UID. Vì vậy Rules có thể nhận diện đúng từng ESP32 mà không cần email/password.

> Nếu xóa flash/NVS của ESP32, thiết bị sẽ nhận anonymous UID mới. Với thiết bị đã từng claim, cần xóa claim cũ trong Firebase hoặc provision lại thiết bị.

## 2. App tự tìm ESP32

ESP32 sau khi vào Wi‑Fi sẽ tạo:

```text
devices/{DEVICE_ID}
device_public/{DEVICE_ID}
```

`device_public` chỉ chứa metadata discovery:

```json
{
  "device_id": "ESP32_001",
  "last_seen": 1760000000,
  "online": true,
  "claimable": true
}
```

App sau khi người dùng đăng nhập sẽ lắng nghe:

```text
device_public
```

Thiết bị nào `claimable == true` sẽ tự xuất hiện trong màn hình **Cây trồng**.

Không cần nhập `device_id` thủ công.

## 3. Tự ghép ESP32 với cây

Trong App:

```text
Đăng nhập
  ↓
Cây trồng
  ↓
ESP32 được tìm thấy
  ↓
Ghép
```

App thực hiện một multi-location update:

```text
plants/{plantId}
users/{uid}/plant_ids
devices/{deviceId}/owner_uid
devices/{deviceId}/plant_id
devices/{deviceId}/claimable = false
device_public/{deviceId}/claimable = false
```

Do update là atomic nên không có trạng thái "cây đã tạo nhưng device chưa claim" trong cùng request.

ESP32 cứ mỗi vài giây đọc:

```text
devices/{DEVICE_ID}
```

Khi thấy:

```text
plant_id = plant_xxx
```

firmware tự chuyển sang gửi dữ liệu cho cây đó.

## 4. Firebase Rules

File:

```text
database.rules.json
```

Các nguyên tắc:

### App user

Được:

- đọc profile của chính mình
- đọc các cây có `owner_uid == auth.uid`
- tạo/sửa/xóa cây của chính mình
- claim thiết bị chưa claim
- bỏ claim thiết bị của chính mình khi xóa cây
- ghi command tưới của cây mình sở hữu

### ESP32

Chỉ dùng Firebase Anonymous Auth.

Được:

- đăng ký/heartbeat chính nó
- đọc node `devices/{DEVICE_ID}` của chính nó
- ghi `current_data` vào plant đã được app claim cho chính nó
- ghi `sensor_history` cho plant đã được claim

Không được:

- đổi `owner_uid`
- tự claim plant
- đọc dữ liệu cây của user khác
- ghi history cho plant khác

## 5. Cấu hình Firebase

Trong Firebase Console:

### Authentication

Bật:

```text
Email/Password
Anonymous
```

Email/Password dành cho App.

Anonymous dành cho ESP32.

### Realtime Database

Deploy:

```text
database.rules.json
```

Ví dụ Firebase CLI:

```bash
firebase deploy --only database
```

Nếu chưa có Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only database
```

## 6. Cấu hình App

Mở:

```text
firebaseConfig.js
```

điền Web App config:

```js
const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  databaseURL: 'https://...firebasedatabase.app',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...',
};
```

Không đưa Firebase Admin SDK/private key vào Expo.

Cài dependency:

```bash
npm install
```

Chạy:

```bash
npm start
```

## 7. Cấu hình ESP32

Mở:

```text
PlantCare_Firebase_ESP32.ino
```

Chỉ cần sửa:

```cpp
#define WIFI_SSID       "YOUR_WIFI_NAME"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

#define FIREBASE_API_KEY "YOUR_FIREBASE_WEB_API_KEY"

#define FIREBASE_DATABASE_URL \
  "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app"

#define DEVICE_ID "ESP32_001"
```

Không còn:

```cpp
#define device Firebase email ...
#define device Firebase password ...
#define plant ID ...
```

Không cần copy `plantId` từ Firebase vào firmware.

## 8. Cài thư viện Arduino

Cài:

- DHT sensor library by Adafruit
- Adafruit Unified Sensor
- LiquidCrystal I2C
- ArduinoJson

ESP32 Arduino Core cung cấp:

- WiFi
- HTTPClient
- WiFiClientSecure
- Preferences
- time/NTP

## 9. Chu kỳ hoạt động ESP32

ESP32:

- Wi‑Fi reconnect tự động
- Firebase Anonymous Auth
- lưu refresh token trong NVS
- đăng ký device
- heartbeat khoảng 5 giây
- kiểm tra assignment khoảng 5 giây
- gửi `current_data` mỗi 10 giây
- gửi history mỗi 60 giây

Sau khi app claim:

```text
plantId = devices/{DEVICE_ID}/plant_id
```

Firmware dùng `plantId` này cho mọi lần upload.

## 10. Realtime App

App vẫn dùng:

```js
onValue(ref(db, `plants/${plantId}`), ...)
```

Do ESP32 ghi:

```text
plants/{plantId}/current_data
```

nên UI tự cập nhật ngay khi Firebase thay đổi.

## 11. Cấu trúc dữ liệu chính

```text
users/
  {uid}/
    name
    email
    plant_ids[]

devices/
  {deviceId}/
    device_id
    device_uid
    owner_uid
    plant_id
    claimable
    online
    last_seen

device_public/
  {deviceId}/
    device_id
    claimable
    online
    last_seen

plants/
  {plantId}/
    name
    owner_uid
    device_id
    created_at

    current_data/
      soil_moisture
      temperature
      humidity
      light
      water_level
      status
      device_id
      last_updated

    commands/
      water_now
      updated_at

sensor_history/
  {plantId}/
    {timestamp}/
      soil_moisture
      temperature
      humidity
      light
      water_level
      status
```

## 12. Nếu có nhiều ESP32

Mỗi firmware dùng `DEVICE_ID` khác nhau:

```cpp
#define DEVICE_ID "ESP32_001"
```

và:

```cpp
#define DEVICE_ID "ESP32_002"
```

Không cần tạo Firebase Authentication user thủ công cho từng ESP32.

Khi bật Wi‑Fi:

```text
ESP32_001 -> xuất hiện trong App
ESP32_002 -> xuất hiện trong App
ESP32_003 -> xuất hiện trong App
```

Người dùng chọn **Ghép** cho từng thiết bị.

## 13. Lưu ý HTTPS

Firmware hiện giữ:

```cpp
secureClient.setInsecure();
```

để code chạy dễ trên ESP32 và tránh lỗi CA certificate trong demo.

Production nên thay bằng CA certificate/server verification thay vì `setInsecure()`.

## 14. Xóa cây

Khi user xóa cây, App đồng thời:

```text
plants/{plantId} = null
users/{uid}/plant_ids = [...]
devices/{deviceId}/owner_uid = null
devices/{deviceId}/plant_id = null
devices/{deviceId}/claimable = true
device_public/{deviceId}/claimable = true
```

ESP32 sau đó tự trở lại trạng thái:

```text
Chưa ghép
```

và xuất hiện lại trong danh sách thiết bị chờ ghép.

## 15. Không còn secret device trong source

Kiểm tra source:

```bash
grep -R "device Firebase email" .
grep -R "device Firebase password" .
```

Hai chuỗi này không còn trong bản mới.

`FIREBASE_API_KEY` không phải Firebase Admin private key; đây là Web API key dùng cho Firebase client REST authentication.

