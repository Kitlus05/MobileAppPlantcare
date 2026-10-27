/*
 * ============================================================
 * PLANTCARE - ESP32 -> FIREBASE REALTIME DATABASE
 * ============================================================
 *
 * Luong du lieu:
 *   Cam bien -> ESP32 -> Firebase Realtime Database -> App Expo
 *
 * Cam bien:
 *   DHT22      DATA -> GPIO 4
 *   Soil       A0   -> GPIO 35
 *   LDR        A0   -> GPIO 34
 *   Water      S    -> GPIO 33
 *   Button          -> GPIO 27 (INPUT_PULLUP)
 *   LCD SDA         -> GPIO 21
 *   LCD SCL         -> GPIO 22
 *
 * Firebase:
 *   /plants/{plantId}/current_data
 *   /sensor_history/{plantId}/{timestamp}
 *
 * IMPORTANT:
 *   1. ESP32 dung Firebase Anonymous Authentication.
 *   2. Anonymous UID duoc luu trong NVS de giu danh tinh thiet bi.
 *   3. DEVICE_ID la khoa registry; khong duoc dung lai cho firmware khac.
 *   4. App se claim thiet bi dang cho va tao plant.
 *   5. ESP32 doc plantId tu /devices/{DEVICE_ID}/plant_id.
 *
 * Nut bam (GPIO 27) dung ngat phan cung; Firebase chay o task rieng (core 0).
 *
 * Thu vien can cai:
 *   - DHT sensor library by Adafruit
 *   - Adafruit Unified Sensor
 *   - LiquidCrystal I2C
 *   - ArduinoJson
 *
 * ESP32 Arduino Core co san:
 *   - WiFi.h
 *   - HTTPClient.h
 *   - WiFiClientSecure.h
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <Preferences.h>

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>

// ============================================================
// 1. WIFI - SUA CAC GIA TRI NAY
// ============================================================

#define WIFI_SSID       "YOUR_WIFI_NAME"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// ============================================================
// 2. FIREBASE - SUA CAC GIA TRI NAY
// ============================================================

// Firebase Web API Key.
// Firebase Console -> Project settings -> Your apps -> Web app
#define FIREBASE_API_KEY "AIzaSyAebDHuY5Q4L1kBfeuxH5eN6Udhe5jtvqA"

// Realtime Database URL, khong can dau / o cuoi.
#define FIREBASE_DATABASE_URL "https://plantcare-ecbc6-default-rtdb.asia-southeast1.firebasedatabase.app"

// ESP32 khong can email/password Firebase.
// Firmware su dung Firebase Anonymous Authentication va luu refresh token
// trong NVS (Preferences), sau do app logged-in se claim thiet bi.
#define DEVICE_ID "ESP32_001"

// ============================================================
// 3. BOM / RELAY (TUOI NUOC) - SUA THEO PHAN CUNG CUA BAN
// ============================================================
//
// PUMP_PIN = -1  -> TAT chuc nang bom (an toan, mac dinh).
// Khi da noi relay, doi thanh so GPIO that (vi du 26).
//
// PUMP_ACTIVE_LOW:
//   true  -> relay kich muc THAP (LOW = bom chay). Da so module relay 5V.
//   false -> relay kich muc CAO (HIGH = bom chay).
// Neu dat sai, bom se chay luc khoi dong -> kiem tra truoc khi cam bom that.

#define PUMP_PIN -1
#define PUMP_ACTIVE_LOW true

// ============================================================
// 4. CHAN CAM BIEN
// ============================================================

#define DHTPIN 4
#define DHTTYPE DHT22

#define SOIL_PIN 35
#define LDR_PIN 34
#define WATER_LEVEL_PIN 33
#define BUTTON_PIN 27

#define SDA_PIN 21
#define SCL_PIN 22

DHT dht(DHTPIN, DHTTYPE);

// ============================================================
// SENSOR DATA STRUCTURE
// Khai bao truoc cac ham de Arduino nhan biet kieu du lieu.
// ============================================================
struct SensorData {
  float temperature;
  float humidity;

  int soilMoisture;
  int light;
  int waterLevel;

  bool dhtValid;
  bool waterValid;

  String status;
};

// ============================================================
// 5. HIEU CHINH CAM BIEN
// ============================================================

#define SOIL_DRY_RAW 3000
#define SOIL_WET_RAW 1200

#define LDR_DARK_RAW 4095
#define LDR_BRIGHT_RAW 200

#define WATER_DRY_RAW 100
#define WATER_FULL_RAW 2800

#define WATER_SAMPLE_COUNT 15
#define WATER_SAMPLE_DELAY_MS 5
#define WATER_UNSTABLE_THRESHOLD 600

bool lastWaterUnstable = false;

// ============================================================
// 6. CHU KY GUI FIREBASE
// ============================================================

const unsigned long SENSOR_UPLOAD_INTERVAL = 3000;        // 3 giay (nhanh hon nho keep-alive)
const unsigned long HISTORY_UPLOAD_INTERVAL = 60000;       // 60 giay
const unsigned long AUTH_REFRESH_INTERVAL = 50UL * 60UL * 1000UL;
const unsigned long HEARTBEAT_INTERVAL = 10000;            // bao "online" moi 10 giay
const unsigned long ASSIGN_POLL_UNPAIRED = 3000;           // chua ghep: hoi 3 giay/lan (ghep xong nhan ngay)
const unsigned long ASSIGN_POLL_PAIRED = 15000;            // da ghep: 15 giay/lan (phat hien huy ghep)
const unsigned long CONTROL_POLL_INTERVAL = 3000;          // doc lenh tuoi / tu dong tuoi
const unsigned long AUTO_WATER_COOLDOWN = 15UL * 60UL * 1000UL;  // toi thieu 15 phut giua 2 lan tu dong tuoi

unsigned long lastSensorUpload = 0;
unsigned long lastHistoryUpload = 0;
unsigned long lastAuthTime = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastAssignPoll = 0;
unsigned long lastControlPoll = 0;
unsigned long lastRegisterTry = 0;

String idToken = "";
String refreshToken = "";
String deviceUid = "";
String plantId = "";
bool deviceRegistered = false;

// time(nullptr) chi dung duoc sau khi NTP dong bo (> nam 2023).
bool timeIsValid() {
  return time(nullptr) > 1700000000;
}

Preferences prefs;
WiFiClientSecure secureClient;

// Trang thai dieu khien bom. Task mang doc lenh tu Firebase, loop() dieu khien relay.
volatile bool plantAssigned = false;     // thiet bi da duoc app ghep voi cay chua
volatile bool pendingWaterNow = false;   // app bam "Tuoi ngay"
volatile bool autoWatering = false;      // che do tu tuoi
volatile int  autoThreshold = 30;        // tu tuoi khi do am dat < nguong (%)
volatile int  pumpSeconds = 5;           // so giay bom moi lan
volatile bool pumpRunning = false;
volatile bool uploadNow = false;         // yeu cau gui current_data ngay (vd khi bom bat/tat)

// Du lieu cam bien moi nhat: loop() ghi, networkTask() doc (bao ve bang mutex).
SensorData latestData;
bool latestValid = false;
SemaphoreHandle_t dataMutex = nullptr;

void setLatestData(const SensorData& d) {
  if (dataMutex && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    latestData = d;
    latestValid = true;
    xSemaphoreGive(dataMutex);
  }
}

bool getLatestData(SensorData& out) {
  bool ok = false;
  if (dataMutex && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    if (latestValid) {
      out = latestData;
      ok = true;
    }
    xSemaphoreGive(dataMutex);
  }
  return ok;
}

// ============================================================
// 8. LCD
// ============================================================

LiquidCrystal_I2C* lcd = nullptr;
bool lcdFound = false;

int currentScreen = 0;
const int TOTAL_SCREENS = 4;

bool lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 200;

unsigned long lastLcdRefresh = 0;
const unsigned long LCD_REFRESH_INTERVAL = 500;

// ============================================================
// 9. HELPER - WIFI
// ============================================================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Dang ket noi WiFi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long started = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < 20000) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK - IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi FAILED");
  }
}

// ============================================================
// 10. FIREBASE AUTH - ANONYMOUS, KHONG EMAIL/PASSWORD
// ============================================================

bool firebaseRequestTokenRefresh() {
  if (refreshToken.length() == 0) return false;

  secureClient.stop();   // ket noi dang giu la cua host Firebase DB

  HTTPClient http;
  String url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  String body = "grant_type=refresh_token&refresh_token=" + refreshToken;
  int httpCode = http.POST(body);
  String response = http.getString();

  if (httpCode != 200) {
    Serial.print("Refresh Firebase token loi HTTP: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) {
    http.end();
    return false;
  }

  idToken = doc["id_token"] | "";
  refreshToken = doc["refresh_token"] | refreshToken;
  deviceUid = doc["user_id"] | deviceUid;

  prefs.putString("refresh_token", refreshToken);
  prefs.putString("device_uid", deviceUid);
  lastAuthTime = millis();

  http.end();
  return idToken.length() > 0;
}

bool firebaseAnonymousLogin() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  // Uu tien refresh token da luu de giu nguyen Firebase UID cua thiet bi.
  if (firebaseRequestTokenRefresh()) {
    Serial.println("Firebase Anonymous Authentication: refresh OK");
    return true;
  }

  secureClient.stop();

  HTTPClient http;
  String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=") + FIREBASE_API_KEY;
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument requestDoc;
  requestDoc["returnSecureToken"] = true;

  String requestBody;
  serializeJson(requestDoc, requestBody);
  int httpCode = http.POST(requestBody);
  String response = http.getString();

  if (httpCode != 200) {
    Serial.print("Firebase anonymous sign-up loi HTTP: ");
    Serial.println(httpCode);
    Serial.println(response);
    http.end();
    return false;
  }

  JsonDocument responseDoc;
  if (deserializeJson(responseDoc, response)) {
    http.end();
    return false;
  }

  idToken = responseDoc["idToken"] | "";
  refreshToken = responseDoc["refreshToken"] | "";
  deviceUid = responseDoc["localId"] | "";

  prefs.putString("refresh_token", refreshToken);
  prefs.putString("device_uid", deviceUid);

  lastAuthTime = millis();
  http.end();

  Serial.print("Firebase Anonymous UID: ");
  Serial.println(deviceUid);
  return idToken.length() > 0 && deviceUid.length() > 0;
}

bool ensureFirebaseAuth() {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (idToken.length() == 0) {
    return firebaseAnonymousLogin();
  }

  if (millis() - lastAuthTime >= AUTH_REFRESH_INTERVAL) {
    if (!firebaseRequestTokenRefresh()) {
      idToken = "";
      return firebaseAnonymousLogin();
    }
  }

  return true;
}

// ============================================================
// 11. FIREBASE GET/PATCH/PUT (giu ket noi TLS - keep-alive)
// Mo moi ket noi HTTPS ton 1-2 giay. Dung chung 1 HTTPClient +
// setReuse(true) de cac request sau chi mat ~100-300 ms.
// ============================================================

HTTPClient gHttp;
bool gHttpInit = false;

// Tra ve ma HTTP; <= 0 la loi ket noi. Tu thu lai 1 lan neu server da dong ket noi.
int firebaseRequest(const char* method, const String& path, const String& body, String& response) {
  for (int attempt = 0; attempt < 2; attempt++) {
    if (!gHttpInit) {
      gHttp.setReuse(true);
      gHttpInit = true;
    }

    String url = String(FIREBASE_DATABASE_URL) + "/" + path + ".json?auth=" + idToken;
    gHttp.begin(secureClient, url);
    gHttp.addHeader("Content-Type", "application/json");

    int code;
    if (strcmp(method, "GET") == 0) {
      code = gHttp.GET();
    } else {
      code = gHttp.sendRequest(method, (uint8_t*)body.c_str(), body.length());
    }

    if (code > 0) {
      response = gHttp.getString();
      gHttp.end();
      return code;
    }

    // Ket noi cu bi dong -> huy han va thu lai bang ket noi moi.
    gHttp.end();
    secureClient.stop();
  }
  return -1;
}

bool firebaseGet(const String& path, String& response) {
  if (!ensureFirebaseAuth()) return false;

  int httpCode = firebaseRequest("GET", path, "", response);

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase GET loi HTTP: ");
    Serial.println(httpCode);
    if (httpCode == 401 && response.indexOf("Permission denied") < 0) idToken = "";
    return false;
  }

  return true;
}

bool firebasePatch(const String& path, const String& jsonBody) {
  if (!ensureFirebaseAuth()) return false;

  String response;
  int httpCode = firebaseRequest("PATCH", path, jsonBody, response);

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase PATCH loi HTTP: ");
    Serial.println(httpCode);
    Serial.println(response);
    if (httpCode == 401 && response.indexOf("Permission denied") < 0) idToken = "";
    return false;
  }

  return true;
}

bool firebasePut(const String& path, const String& jsonBody) {
  if (!ensureFirebaseAuth()) return false;

  String response;
  int httpCode = firebaseRequest("PUT", path, jsonBody, response);

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase PUT loi HTTP: ");
    Serial.println(httpCode);
    Serial.println(response);
    if (httpCode == 401 && response.indexOf("Permission denied") < 0) idToken = "";
    return false;
  }

  return true;
}

// ============================================================
// 12. DANG KY + TU DONG NHAN plant ID
// ============================================================

bool registerDevice() {
  if (!ensureFirebaseAuth()) return false;

  if (!timeIsValid()) {
    Serial.println("Chua co gio NTP - chua dang ky device.");
    return false;
  }

  String existing;
  bool hasExisting =
    firebaseGet(String("devices/") + DEVICE_ID, existing);

  JsonDocument existingDoc;

  if (hasExisting && existing.length() > 0 && existing != "null") {
    if (deserializeJson(existingDoc, existing)) {
      Serial.println("Device registry JSON loi.");
      return false;
    }

    String registeredUid =
      existingDoc["device_uid"] | "";

    // Khong cho mot firmware moi tu y chiem DEVICE_ID da dang ky
    // voi Anonymous UID khac. UID duoc luu trong NVS la danh tinh
    // cua thiet bi nay.
    if (registeredUid.length() > 0 &&
        registeredUid != deviceUid) {
      Serial.println("DEVICE_ID da duoc dang ky boi UID khac.");
      Serial.println("Khong ghi de device registry.");
      return false;
    }
  }

  String existingOwner =
    existingDoc["owner_uid"] | "";

  String existingPlant =
    existingDoc["plant_id"] | "";

  bool claimed =
    existingOwner.length() > 0 &&
    existingPlant.length() > 0;

  JsonDocument doc;

  doc["device_id"] = DEVICE_ID;
  doc["device_uid"] = deviceUid;
  doc["last_seen"] = (unsigned long)time(nullptr);
  doc["online"] = true;
  doc["claimable"] = !claimed;

  // Khi da claim, khong PATCH owner/plant:
  // giu nguyen mapping do App tao.
  String body;
  serializeJson(doc, body);

  if (!firebasePatch(String("devices/") + DEVICE_ID, body)) {
    Serial.println("Khong dang ky/cap nhat duoc device registry.");
    return false;
  }

  JsonDocument publicDoc;

  publicDoc["device_id"] = DEVICE_ID;
  publicDoc["last_seen"] = (unsigned long)time(nullptr);
  publicDoc["online"] = true;
  publicDoc["claimable"] = !claimed;

  String publicBody;
  serializeJson(publicDoc, publicBody);

  if (!firebasePatch(String("device_public/") + DEVICE_ID, publicBody)) {
    Serial.println("Khong cap nhat duoc device_public.");
    return false;
  }

  if (!claimed) {
    plantId = "";
    plantAssigned = false;
  }

  Serial.println(claimed
    ? "Device registry: DA CLAIM, giu nguyen mapping."
    : "Device registry: SAN SANG DISCOVERY.");

  return true;
}

bool syncDeviceAssignment() {
  String response;
  if (!firebaseGet(String("devices/") + DEVICE_ID, response)) return false;

  JsonDocument doc;
  if (deserializeJson(doc, response)) return false;

  String assigned = doc["plant_id"] | "";

  if (assigned != plantId) {
    plantId = assigned;
    plantAssigned = plantId.length() > 0;
    if (!plantAssigned) {
      autoWatering = false;
      pendingWaterNow = false;
    }

    if (plantId.length() > 0) {
      Serial.print("Plant ID duoc app claim: ");
      Serial.println(plantId);
    } else {
      Serial.println("Thiet bi da duoc unclaim - quay ve cho ghep.");
    }
  }

  return true;
}

// Chi 1 request: cap nhat device_public (app dung de phat hien thiet bi online).
// Neu node devices bi xoa, rule se tu choi -> tra false -> task mang dang ky lai.
bool heartbeatDevice() {
  if (!timeIsValid()) return false;

  JsonDocument publicDoc;
  publicDoc["last_seen"] = (unsigned long)time(nullptr);
  publicDoc["online"] = true;
  publicDoc["claimable"] = !plantAssigned;

  String publicBody;
  serializeJson(publicDoc, publicBody);

  return firebasePatch(String("device_public/") + DEVICE_ID, publicBody);
}

// ============================================================
// 13. DOC LENH DIEU KHIEN: plants/{plantId}/control
//   water_now      : app bam "Tuoi ngay" (firmware tu xoa ve false)
//   auto_watering  : tu tuoi khi dat kho
//   auto_threshold : nguong do am dat (%)
//   pump_seconds   : so giay bom moi lan
// ============================================================

bool syncControl() {
  if (!plantAssigned) return false;

  String path = String("plants/") + plantId + "/control";
  String response;
  if (!firebaseGet(path, response)) return false;

  if (response.length() == 0 || response == "null") {
    autoWatering = false;
    return true;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) return false;

  autoWatering = doc["auto_watering"] | false;
  autoThreshold = constrain((int)(doc["auto_threshold"] | 30), 0, 100);
  pumpSeconds = constrain((int)(doc["pump_seconds"] | 5), 1, 30);

  if (doc["water_now"] | false) {
    // Xoa co truoc de khong bi lap lai ngay ca khi mat mang giua chung.
    if (firebasePatch(path, "{\"water_now\":false}")) {
      pendingWaterNow = true;
      Serial.println("Nhan lenh TUOI NGAY tu app.");
    }
  }

  return true;
}

// ============================================================
// 14. CAM BIEN MUC NUOC - LOC NHIEU
// ============================================================

int readWaterLevelRawFiltered() {
  int samples[WATER_SAMPLE_COUNT];

  for (int i = 0; i < WATER_SAMPLE_COUNT; i++) {
    samples[i] = analogRead(WATER_LEVEL_PIN);
    delay(WATER_SAMPLE_DELAY_MS);
  }

  for (int i = 0; i < WATER_SAMPLE_COUNT - 1; i++) {
    for (int j = 0;
         j < WATER_SAMPLE_COUNT - 1 - i;
         j++) {

      if (samples[j] > samples[j + 1]) {
        int temp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = temp;
      }
    }
  }

  long sum = 0;
  int usedCount = 0;

  int minVal = 4095;
  int maxVal = 0;

  for (int i = 2; i < WATER_SAMPLE_COUNT - 2; i++) {
    sum += samples[i];
    usedCount++;

    if (samples[i] < minVal) {
      minVal = samples[i];
    }

    if (samples[i] > maxVal) {
      maxVal = samples[i];
    }
  }

  lastWaterUnstable =
    (maxVal - minVal) >
    WATER_UNSTABLE_THRESHOLD;

  return (int)(sum / usedCount);
}

// ============================================================
// 15. RAW -> PERCENT
// ============================================================

int rawToPercent(
  int raw,
  int rawAtZeroPercent,
  int rawAtHundredPercent
) {
  int percent =
    map(
      raw,
      rawAtZeroPercent,
      rawAtHundredPercent,
      0,
      100
    );

  return constrain(percent, 0, 100);
}

// ============================================================
// 16. STATUS
// ============================================================

String calculateStatus(
  int soilPercent,
  bool waterUnstable
) {
  if (waterUnstable) {
    return "Cam bien khong on dinh";
  }

  if (soilPercent < 30) {
    return "Can tuoi";
  }

  if (soilPercent > 85) {
    return "Dat qua am";
  }

  return "Tot";
}

// ============================================================
// 17. DOC TOAN BO SENSOR
// ============================================================

SensorData readSensors() {
  SensorData data;

  data.temperature = dht.readTemperature();
  data.humidity = dht.readHumidity();

  data.dhtValid =
    !isnan(data.temperature) &&
    !isnan(data.humidity);

  int soilRaw =
    analogRead(SOIL_PIN);

  int ldrRaw =
    analogRead(LDR_PIN);

  int waterRaw =
    readWaterLevelRawFiltered();

  data.soilMoisture =
    rawToPercent(
      soilRaw,
      SOIL_DRY_RAW,
      SOIL_WET_RAW
    );

  data.light =
    rawToPercent(
      ldrRaw,
      LDR_DARK_RAW,
      LDR_BRIGHT_RAW
    );

  data.waterLevel =
    rawToPercent(
      waterRaw,
      WATER_DRY_RAW,
      WATER_FULL_RAW
    );

  data.waterValid =
    !lastWaterUnstable;

  data.status =
    calculateStatus(
      data.soilMoisture,
      lastWaterUnstable
    );

  return data;
}

// ============================================================
// 18. GUI CURRENT_DATA LEN FIREBASE
// ============================================================

bool uploadCurrentData(
  const SensorData& data
) {
  JsonDocument doc;

  doc["soil_moisture"] =
    data.soilMoisture;

  doc["temperature"] =
    data.dhtValid
      ? data.temperature
      : 0;

  doc["humidity"] =
    data.dhtValid
      ? data.humidity
      : 0;

  doc["light"] =
    data.light;

  doc["water_level"] =
    data.waterLevel;

  doc["status"] =
    data.status;

  // Co hieu de app hien thi giong LCD ("DHT: Loi doc", "Khong on dinh!")
  doc["dht_ok"] = data.dhtValid;
  doc["water_ok"] = data.waterValid;
  doc["source"] = "esp32";   // app chi hien thi du lieu co dau nay
  doc["pump_status"] = (bool)pumpRunning;
  doc["pump_ready"] = (PUMP_PIN >= 0);

  doc["device_id"] =
    DEVICE_ID;

  doc["last_updated"] =
    (unsigned long)time(nullptr);

  String body;
  serializeJson(doc, body);

  if (plantId.length() == 0) {
    Serial.println("Chua duoc app ghep voi cay - bo qua current_data.");
    return false;
  }

  String path =
    String("plants/") +
    plantId +
    "/current_data";

  bool ok =
    firebasePatch(path, body);

  if (ok) {
    Serial.println("Firebase current_data: OK");
  } else {
    Serial.println("Firebase current_data: FAILED");
  }

  return ok;
}

// ============================================================
// 19. GUI SENSOR HISTORY
// ============================================================

bool uploadHistory(
  const SensorData& data
) {
  if (plantId.length() == 0) {
    Serial.println("Chua duoc app ghep voi cay - bo qua history.");
    return false;
  }

  JsonDocument doc;

  doc["soil_moisture"] =
    data.soilMoisture;

  doc["temperature"] =
    data.dhtValid
      ? data.temperature
      : 0;

  doc["humidity"] =
    data.dhtValid
      ? data.humidity
      : 0;

  doc["light"] =
    data.light;

  doc["water_level"] =
    data.waterLevel;

  doc["status"] =
    data.status;

  // Co hieu de app hien thi giong LCD ("DHT: Loi doc", "Khong on dinh!")
  doc["dht_ok"] = data.dhtValid;
  doc["water_ok"] = data.waterValid;
  doc["source"] = "esp32";   // app chi hien thi du lieu co dau nay

  time_t now = time(nullptr);

  // Neu NTP chua dong bo, bo qua ban ghi history de tranh ghi timestamp = 0.
  if (now < 1700000000) {
    Serial.println("NTP chua dong bo - bo qua history lan nay.");
    return false;
  }

  unsigned long timestamp =
    (unsigned long)now;

  String body;
  serializeJson(doc, body);

  String path =
    String("sensor_history/") +
    plantId +
    "/" +
    String(timestamp);

  bool ok =
    firebasePut(path, body);

  if (ok) {
    Serial.println("Firebase sensor_history: OK");
  } else {
    Serial.println("Firebase sensor_history: FAILED");
  }

  return ok;
}

// ============================================================
// 20. LCD
// ============================================================

byte scanI2CAddress() {
  Serial.println("Dang do dia chi I2C...");

  for (byte address = 1;
       address < 127;
       address++) {

    Wire.beginTransmission(address);
    byte error =
      Wire.endTransmission();

    if (error == 0) {
      Serial.print(
        "Tim thay thiet bi I2C tai dia chi: 0x"
      );

      Serial.println(
        address,
        HEX
      );

      return address;
    }
  }

  Serial.println(
    "KHONG tim thay thiet bi I2C nao!"
  );

  return 0;
}

void lcdPrintLine(
  int row,
  String text
) {
  while (text.length() < 16) {
    text += " ";
  }

  if (text.length() > 16) {
    text =
      text.substring(0, 16);
  }

  lcd->setCursor(0, row);
  lcd->print(text);
}

void showScreen(
  int screen,
  const SensorData& data
) {
  if (!lcdFound) {
    return;
  }

  if (screen == 0) {

    if (data.dhtValid) {
      lcdPrintLine(
        0,
        "Nhiet do: " +
        String(data.temperature, 1) +
        (char)223 +
        "C"
      );

      lcdPrintLine(
        1,
        "Do am KK: " +
        String(data.humidity, 1) +
        "%"
      );

    } else {
      lcdPrintLine(
        0,
        "DHT: Loi doc"
      );

      lcdPrintLine(
        1,
        "Kiem tra cam bien"
      );
    }

  } else if (screen == 1) {

    lcdPrintLine(
      0,
      "Do am dat:"
    );

    lcdPrintLine(
      1,
      String(data.soilMoisture) +
      " %"
    );

  } else if (screen == 2) {

    lcdPrintLine(
      0,
      "Anh sang:"
    );

    lcdPrintLine(
      1,
      String(data.light) +
      " %"
    );

  } else if (screen == 3) {

    lcdPrintLine(
      0,
      "Muc nuoc:"
    );

    if (data.waterValid) {
      lcdPrintLine(
        1,
        String(data.waterLevel) +
        " %"
      );
    } else {
      lcdPrintLine(
        1,
        "Khong on dinh!"
      );
    }
  }
}

// ============================================================
// 21. SERIAL
// ============================================================

void printAllSensorsToSerial(
  const SensorData& data
) {
  Serial.println(
    "========================================"
  );

  if (data.dhtValid) {
    Serial.print(
      "Nhiet do       : "
    );
    Serial.print(
      data.temperature,
      1
    );
    Serial.println(" C");

    Serial.print(
      "Do am khong khi: "
    );
    Serial.print(
      data.humidity,
      1
    );
    Serial.println(" %");

  } else {
    Serial.println(
      "DHT: LOI"
    );
  }

  Serial.print(
    "Do am dat      : "
  );
  Serial.print(
    data.soilMoisture
  );
  Serial.println(" %");

  Serial.print(
    "Anh sang       : "
  );
  Serial.print(
    data.light
  );
  Serial.println(" %");

  Serial.print(
    "Muc nuoc       : "
  );

  if (data.waterValid) {
    Serial.print(
      data.waterLevel
    );
    Serial.println(" %");
  } else {
    Serial.println(
      "KHONG ON DINH"
    );
  }

  Serial.print(
    "Status         : "
  );
  Serial.println(
    data.status
  );
}

// ============================================================
// 22. NUT BAM - NGAT PHAN CUNG
// Nut duoc bat bang ngat nen khong bi mat khi dang gui Firebase.
// ============================================================

volatile bool buttonFlag = false;
volatile unsigned long lastButtonIsr = 0;

void IRAM_ATTR onButtonPress() {
  unsigned long now = millis();
  if (now - lastButtonIsr > 200) {   // chong doi phim 200 ms
    lastButtonIsr = now;
    buttonFlag = true;
  }
}

// ============================================================
// 22b. DIEU KHIEN BOM (chay trong loop(), khong chan)
// ============================================================

unsigned long pumpOffAt = 0;
unsigned long lastPumpEnd = 0;

void pumpWrite(bool on) {
  if (PUMP_PIN < 0) return;
  bool level = PUMP_ACTIVE_LOW ? !on : on;
  digitalWrite(PUMP_PIN, level ? HIGH : LOW);
}

void startPump() {
  if (PUMP_PIN < 0) {
    Serial.println("Chua cau hinh PUMP_PIN - bo qua lenh tuoi.");
    return;
  }

  pumpOffAt = millis() + (unsigned long)pumpSeconds * 1000UL;
  pumpRunning = true;
  pumpWrite(true);
  uploadNow = true;

  Serial.print("BOM BAT - ");
  Serial.print((int)pumpSeconds);
  Serial.println(" giay");
}

void stopPump() {
  pumpWrite(false);
  pumpRunning = false;
  lastPumpEnd = millis();
  uploadNow = true;
  Serial.println("BOM TAT");
}

void handlePump(const SensorData& d) {
  // Het gio -> tat bom
  if (pumpRunning && (long)(millis() - pumpOffAt) >= 0) {
    stopPump();
  }

  if (pumpRunning) {
    pendingWaterNow = false;   // dang tuoi, bo qua lenh trung
    return;
  }

  if (pendingWaterNow) {
    pendingWaterNow = false;
    startPump();
    return;
  }

  // Tu dong tuoi: dat kho hon nguong, cam bien tin cay, du thoi gian nghi.
  if (autoWatering &&
      plantAssigned &&
      PUMP_PIN >= 0 &&
      d.status != "Cam bien khong on dinh" &&
      d.soilMoisture < autoThreshold &&
      (lastPumpEnd == 0 || millis() - lastPumpEnd > AUTO_WATER_COOLDOWN)) {
    Serial.println("Tu dong tuoi: dat kho hon nguong.");
    startPump();
  }
}

// ============================================================
// 23. TASK MANG - chay rieng tren core 0
// Moi thao tac Firebase (HTTPS) co the mat 0.1-3 giay. Neu chay trong
// loop() thi nut bam va LCD bi "dong". Tach ra task rieng de loop()
// luon phan hoi tuc thi.
// ============================================================

void networkTask(void* param) {
  connectWiFi();

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // Cho NTP dong bo toi da ~10 giay de last_seen dung.
  for (int i = 0; i < 20 && !timeIsValid(); i++) {
    vTaskDelay(500 / portTICK_PERIOD_MS);
  }

  if (firebaseAnonymousLogin()) {
    deviceRegistered = registerDevice();
    if (deviceRegistered) syncDeviceAssignment();
  }

  Serial.println("=== PLANTCARE ESP32 READY ===");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Plant ID: ");
  Serial.println(plantId.length() ? plantId : "(chua ghep - cho app claim)");

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    unsigned long now = millis();

    if (ensureFirebaseAuth()) {

      if (!deviceRegistered) {
        // Dang ky that bai (mang/NTP/rules) hoac node devices bi xoa -> thu lai.
        if (now - lastRegisterTry >= 5000) {
          lastRegisterTry = now;
          deviceRegistered = registerDevice();
        }

      } else {

        // Da duoc app ghep chua? (chua ghep: hoi nhanh; da ghep: hoi cham)
        unsigned long assignEvery =
          plantAssigned ? ASSIGN_POLL_PAIRED : ASSIGN_POLL_UNPAIRED;

        if (now - lastAssignPoll >= assignEvery) {
          lastAssignPoll = now;
          syncDeviceAssignment();
        }

        // Bao online cho app
        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
          lastHeartbeat = now;
          if (!heartbeatDevice()) {
            deviceRegistered = false;
          }
        }

        // Doc lenh tuoi / che do tu dong
        if (plantAssigned &&
            now - lastControlPoll >= CONTROL_POLL_INTERVAL) {
          lastControlPoll = now;
          syncControl();
        }
      }
    }

    // current_data: dinh ky hoac ngay khi bom doi trang thai
    if (uploadNow ||
        millis() - lastSensorUpload >= SENSOR_UPLOAD_INTERVAL) {
      uploadNow = false;
      lastSensorUpload = millis();

      SensorData data;
      if (getLatestData(data)) {
        printAllSensorsToSerial(data);
        uploadCurrentData(data);
      }
    }

    // history
    if (millis() - lastHistoryUpload >= HISTORY_UPLOAD_INTERVAL) {
      lastHistoryUpload = millis();

      SensorData data;
      if (getLatestData(data)) {
        uploadHistory(data);
      }
    }

    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}

// ============================================================
// 24. SETUP
// ============================================================

void setup() {
  // Dua bom ve trang thai TAT truoc moi thu khac.
  if (PUMP_PIN >= 0) {
    pinMode(PUMP_PIN, OUTPUT);
    pumpWrite(false);
  }

  Serial.begin(115200);
  delay(500);

  dht.begin();

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(WATER_LEVEL_PIN, INPUT);

  attachInterrupt(
    digitalPinToInterrupt(BUTTON_PIN),
    onButtonPress,
    FALLING
  );

  Wire.begin(SDA_PIN, SCL_PIN);

  byte foundAddress = scanI2CAddress();

  if (foundAddress != 0) {
    lcd = new LiquidCrystal_I2C(foundAddress, 16, 2);

    lcd->init();
    lcd->backlight();

    lcdPrintLine(0, "PLANTCARE");
    lcdPrintLine(1, "ESP32 starting");

    lcdFound = true;

    delay(1200);
  } else {
    lcdFound = false;
  }

  // Demo HTTPS. Production nen thay bang CA cert thay vi setInsecure().
  secureClient.setInsecure();

  prefs.begin("plantcare", false);
  refreshToken = prefs.getString("refresh_token", "");
  deviceUid = prefs.getString("device_uid", "");

  dataMutex = xSemaphoreCreateMutex();

  // Doc cam bien lan dau de co du lieu cho LCD va Firebase.
  SensorData first = readSensors();
  setLatestData(first);
  showScreen(currentScreen, first);

  // Toan bo Wi-Fi / Firebase chay o task rieng tren core 0.
  xTaskCreatePinnedToCore(
    networkTask,
    "firebase",
    16384,
    nullptr,
    1,
    nullptr,
    0
  );
}

// ============================================================
// 25. LOOP - nut bam, cam bien, LCD, bom (luon nhanh)
// ============================================================

void loop() {
  // Nut bam: doi man hinh LCD
  if (buttonFlag) {
    buttonFlag = false;

    currentScreen = (currentScreen + 1) % TOTAL_SCREENS;

    SensorData d;
    if (getLatestData(d)) {
      showScreen(currentScreen, d);
    }
  }

  // Doc cam bien + lam moi LCD + dieu khien bom moi 500 ms
  if (millis() - lastLcdRefresh >= LCD_REFRESH_INTERVAL) {
    lastLcdRefresh = millis();

    SensorData d = readSensors();
    setLatestData(d);
    showScreen(currentScreen, d);
    handlePump(d);
  }

  delay(5);
}
