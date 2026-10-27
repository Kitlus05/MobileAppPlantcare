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
#define FIREBASE_API_KEY "YOUR_FIREBASE_WEB_API_KEY"

// Realtime Database URL, khong can dau / o cuoi.
#define FIREBASE_DATABASE_URL "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app"

// ESP32 khong can email/password Firebase.
// Firmware su dung Firebase Anonymous Authentication va luu refresh token
// trong NVS (Preferences), sau do app logged-in se claim thiet bi.
#define DEVICE_ID "ESP32_001"

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

const unsigned long SENSOR_UPLOAD_INTERVAL = 10000;       // 10 giay
const unsigned long HISTORY_UPLOAD_INTERVAL = 60000;       // 60 giay
const unsigned long AUTH_REFRESH_INTERVAL = 50UL * 60UL * 1000UL;
const unsigned long DEVICE_SYNC_INTERVAL = 5000;

unsigned long lastSensorUpload = 0;
unsigned long lastHistoryUpload = 0;
unsigned long lastAuthTime = 0;
unsigned long lastDeviceSync = 0;

String idToken = "";
String refreshToken = "";
String deviceUid = "";
String plantId = "";

Preferences prefs;
WiFiClientSecure secureClient;

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
// 11. FIREBASE GET/PATCH/PUT
// ============================================================

bool firebaseGet(const String& path, String& response) {
  if (!ensureFirebaseAuth()) return false;
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(FIREBASE_DATABASE_URL) + "/" + path + ".json?auth=" + idToken;
  http.begin(secureClient, url);

  int httpCode = http.GET();
  response = http.getString();

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase GET loi HTTP: ");
    Serial.println(httpCode);
    if (httpCode == 401) idToken = "";
    http.end();
    return false;
  }

  http.end();
  return true;
}

bool firebasePatch(const String& path, const String& jsonBody) {
  if (!ensureFirebaseAuth()) return false;
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(FIREBASE_DATABASE_URL) + "/" + path + ".json?auth=" + idToken;
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.sendRequest("PATCH", (uint8_t*)jsonBody.c_str(), jsonBody.length());
  String response = http.getString();

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase PATCH loi HTTP: ");
    Serial.println(httpCode);
    Serial.println(response);
    if (httpCode == 401) idToken = "";
    http.end();
    return false;
  }

  http.end();
  return true;
}

bool firebasePut(const String& path, const String& jsonBody) {
  if (!ensureFirebaseAuth()) return false;
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(FIREBASE_DATABASE_URL) + "/" + path + ".json?auth=" + idToken;
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.PUT(jsonBody);
  String response = http.getString();

  if (httpCode < 200 || httpCode >= 300) {
    Serial.print("Firebase PUT loi HTTP: ");
    Serial.println(httpCode);
    Serial.println(response);
    if (httpCode == 401) idToken = "";
    http.end();
    return false;
  }

  http.end();
  return true;
}

// ============================================================
// 12. DANG KY + TU DONG NHAN plant ID
// ============================================================

bool registerDevice() {
  if (!ensureFirebaseAuth()) return false;

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

    if (plantId.length() > 0) {
      Serial.print("Plant ID duoc app claim: ");
      Serial.println(plantId);
    } else {
      Serial.println("Thiet bi da duoc unclaim - quay ve cho ghep.");
    }
  }

  return true;
}

bool heartbeatDevice() {
  JsonDocument doc;
  doc["last_seen"] = (unsigned long)time(nullptr);
  doc["online"] = true;

  String body;
  serializeJson(doc, body);

  if (!firebasePatch(String("devices/") + DEVICE_ID, body)) return false;

  JsonDocument publicDoc;
  publicDoc["last_seen"] = (unsigned long)time(nullptr);
  publicDoc["online"] = true;
  publicDoc["claimable"] = (plantId.length() == 0);

  String publicBody;
  serializeJson(publicDoc, publicBody);
  firebasePatch(String("device_public/") + DEVICE_ID, publicBody);
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
  int screen
) {
  if (!lcdFound) {
    return;
  }

  SensorData data =
    readSensors();

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
// 22. SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  dht.begin();

  pinMode(
    BUTTON_PIN,
    INPUT_PULLUP
  );

  pinMode(
    WATER_LEVEL_PIN,
    INPUT
  );

  Wire.begin(
    SDA_PIN,
    SCL_PIN
  );

  byte foundAddress =
    scanI2CAddress();

  if (foundAddress != 0) {

    lcd =
      new LiquidCrystal_I2C(
        foundAddress,
        16,
        2
      );

    lcd->init();
    lcd->backlight();

    lcdPrintLine(
      0,
      "PLANTCARE"
    );

    lcdPrintLine(
      1,
      "ESP32 starting"
    );

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

  connectWiFi();

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  if (firebaseAnonymousLogin()) {
    registerDevice();
    syncDeviceAssignment();
  }

  Serial.println(
    "=== PLANTCARE ESP32 READY ==="
  );

  Serial.print(
    "Device ID: "
  );
  Serial.println(
    DEVICE_ID
  );

  Serial.print(
    "Plant ID: "
  );
  Serial.println(
    plantId.length() ? plantId : "(chua ghep - cho app claim)"
  );

  Serial.print(
    "Device ID: "
  );
  Serial.println(
    DEVICE_ID
  );

  if (lcdFound) {
    showScreen(
      currentScreen
    );
  }
}

// ============================================================
// 23. LOOP
// ============================================================

void loop() {

  // ----------------------------
  // WiFi
  // ----------------------------

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // ----------------------------
  // Nut bam
  // ----------------------------

  bool reading =
    digitalRead(
      BUTTON_PIN
    );

  if (
    reading == LOW &&
    lastButtonState == HIGH &&
    millis() - lastDebounceTime >
      DEBOUNCE_DELAY
  ) {

    lastDebounceTime =
      millis();

    currentScreen =
      (currentScreen + 1) %
      TOTAL_SCREENS;

    if (lcdFound) {
      showScreen(
        currentScreen
      );
    }
  }

  lastButtonState =
    reading;

  // ----------------------------
  // LCD
  // ----------------------------

  if (
    millis() -
      lastLcdRefresh >=
    LCD_REFRESH_INTERVAL
  ) {

    lastLcdRefresh =
      millis();

    if (lcdFound) {
      showScreen(
        currentScreen
      );
    }
  }

  // ----------------------------
  // Device registry / assignment
  // ----------------------------

  if (
    millis() - lastDeviceSync >= DEVICE_SYNC_INTERVAL
  ) {
    lastDeviceSync = millis();

    if (ensureFirebaseAuth()) {
      syncDeviceAssignment();
      heartbeatDevice();
    }
  }

  // ----------------------------
  // Firebase current_data
  // ----------------------------

  if (
    millis() -
      lastSensorUpload >=
    SENSOR_UPLOAD_INTERVAL
  ) {

    lastSensorUpload =
      millis();

    SensorData data =
      readSensors();

    printAllSensorsToSerial(
      data
    );

    uploadCurrentData(
      data
    );
  }

  // ----------------------------
  // Firebase history
  // ----------------------------

  if (
    millis() -
      lastHistoryUpload >=
    HISTORY_UPLOAD_INTERVAL
  ) {

    lastHistoryUpload =
      millis();

    SensorData data =
      readSensors();

    uploadHistory(
      data
    );
  }
}
