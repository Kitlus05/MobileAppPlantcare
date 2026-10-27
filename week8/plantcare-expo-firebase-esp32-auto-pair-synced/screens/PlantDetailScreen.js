import React, { useEffect, useMemo, useState } from 'react';

import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  ref,
  onValue,
  query,
  orderByKey,
  startAt,
} from 'firebase/database';

import {
  SensorOverview,
  SimpleLineChart,
} from '../components/Common';

import { db } from '../firebaseConfig';
import { C } from '../styles';
import { parseSensor, currentSensorText, historyValue } from '../utils/sensors';
import { useServerClock, ageInfo } from '../utils/useServerClock';
import { downsampleSeries, formatTime } from '../utils/chart';
import { sendWaterNow, readControl } from '../utils/control';

// Khoảng thời gian biểu đồ. Firmware ghi 1 điểm lịch sử / 60 giây.
const RANGES = [
  { key: '1h', label: '1 giờ', sec: 3600 },
  { key: '6h', label: '6 giờ', sec: 6 * 3600 },
  { key: '24h', label: '24 giờ', sec: 24 * 3600 },
];


export default function PlantDetailScreen({
  route,
  navigation,
}) {

  const { plantId } = route.params || {};

  const nowSec = useServerClock();

  const [plant, setPlant] = useState(null);

  const [history, setHistory] = useState([]);

  const [watering, setWatering] = useState(false);

  const [range, setRange] = useState('1h');

  // Cảm biến đang chọn
  const [selectedSensor, setSelectedSensor] =
    useState('soil_moisture');


  // =====================================================
  // LẤY THÔNG TIN CÂY REALTIME
  // =====================================================

  useEffect(() => {

    if (!plantId) return;

    const plantRef = ref(
      db,
      `plants/${plantId}`
    );

    const unsubscribe = onValue(
      plantRef,
      (snap) => {

        const data = snap.val();

        setPlant(data);

        if (data?.name) {

          navigation.setOptions({
            title: data.name,
          });

        }

      }
    );

    return unsubscribe;

  }, [plantId, navigation]);


  // =====================================================
  // LẤY SENSOR HISTORY THEO KHOẢNG THỜI GIAN
  // Key là timestamp (giây) nên lọc bằng orderByKey + startAt:
  // chỉ tải đúng đoạn cần vẽ, các điểm mới được đẩy thêm realtime.
  // =====================================================

  useEffect(() => {

    if (!plantId) return;

    const sec = RANGES.find((r) => r.key === range).sec;
    const fromKey = String(Math.floor(Date.now() / 1000) - sec);

    const histRef = query(
      ref(db, `sensor_history/${plantId}`),
      orderByKey(),
      startAt(fromKey)
    );

    const unsubscribe = onValue(
      histRef,
      (snap) => {

        const data = snap.val() || {};

        const entries = Object.entries(data)
          .map(([key, item]) => ({ t: Number(key), item }))
          .filter((e) => Number.isFinite(e.t))
          .sort((a, b) => a.t - b.t);

        setHistory(entries);

      },
      () => setHistory([])
    );

    return unsubscribe;

  }, [plantId, range]);


  // =====================================================
  // CẤU HÌNH CÁC CẢM BIẾN
  // =====================================================

  const sensorOptions = [

    {
      key: 'soil_moisture',

      title: 'Độ ẩm đất',

      shortTitle: 'Đất',

      icon: 'water-outline',

      unit: '%',

      min: 0,

      max: 100,

    },

    {
      key: 'temperature',

      title: 'Nhiệt độ',

      shortTitle: 'Nhiệt độ',

      icon: 'thermometer-outline',

      unit: '°C',

      min: 0,

      max: 50,

    },

    {
      key: 'humidity',

      title: 'Độ ẩm không khí',

      shortTitle: 'Không khí',

      icon: 'cloud-outline',

      unit: '%',

      min: 0,

      max: 100,

    },

    {
      key: 'light',

      title: 'Ánh sáng',

      shortTitle: 'Ánh sáng',

      icon: 'sunny-outline',

      unit: '%',

      min: 0,

      max: 100,

    },

    {
      key: 'water_level',

      title: 'Mực nước',

      shortTitle: 'Nước',

      icon: 'water-outline',

      unit: '%',

      min: 0,

      max: 100,

    },

  ];


  // =====================================================
  // SENSOR ĐANG CHỌN
  // =====================================================

  const selectedSensorInfo =
    sensorOptions.find(
      (sensor) =>
        sensor.key === selectedSensor
    ) || sensorOptions[0];


  // =====================================================
  // DATA CHO BIỂU ĐỒ
  // lịch sử (60 giây/điểm) + điểm "trực tiếp" từ current_data (3 giây)
  // để đường biểu đồ chạy theo thời gian thực. Giảm còn <= 72 điểm.
  // =====================================================

  const { chartData, xLabels } = useMemo(() => {

    const sec = RANGES.find((r) => r.key === range).sec;
    const from = nowSec - sec;

    const pts = history
      .filter((h) => h.t >= from)
      .map((h) => ({ t: h.t, v: historyValue(h.item, selectedSensor) }));

    const cd = plant?.current_data;
    const liveT = Number(cd?.last_updated);

    if (cd && Number.isFinite(liveT) && liveT >= from && (pts.length === 0 || liveT > pts[pts.length - 1].t)) {
      pts.push({ t: liveT, v: historyValue(cd, selectedSensor) });
    }

    const sampled = downsampleSeries(pts, 72);

    const labels = sampled.length
      ? [
          formatTime(sampled[0].t),
          formatTime(sampled[Math.floor((sampled.length - 1) / 2)].t),
          formatTime(sampled[sampled.length - 1].t),
        ]
      : [];

    return { chartData: sampled.map((p) => p.v), xLabels: labels };

  }, [history, plant, selectedSensor, range, nowSec]);


  // =====================================================
  // GIÁ TRỊ SENSOR HIỆN TẠI
  // =====================================================

  const currentValue =
    currentSensorText(
      plant?.current_data,
      selectedSensor
    );


  // =====================================================
  // TƯỚI NGAY  ->  plants/{id}/control/water_now = true
  // ESP32 đọc mỗi ~3 giây, bật bơm rồi tự đặt lại false.
  // =====================================================

  async function handleWaterNow() {

    if (!plantId) return;

    setWatering(true);

    try {

      await sendWaterNow(plantId);

    } catch (error) {

      Alert.alert(
        'Không gửi được lệnh tưới',
        error?.message || 'Vui lòng thử lại.'
      );

    } finally {

      setTimeout(() => setWatering(false), 1500);

    }

  }


  // =====================================================
  // LOADING
  // =====================================================

  if (!plant) {

    return (

      <View style={s.center}>

        <ActivityIndicator
          size="large"
          color={C.green}
        />

      </View>

    );

  }


  const p = plant.current_data || {};
  const sv = parseSensor(plant.current_data);


  // =====================================================
  // UI
  // =====================================================

  return (

    <ScrollView
      style={{
        flex: 1,
        backgroundColor: C.bg,
      }}

      contentContainerStyle={{
        padding: 20,
        paddingBottom: 30,
      }}
    >


      {/* ================================================= */}
      {/* HERO */}
      {/* ================================================= */}

      <View style={s.hero}>

        <Ionicons
          name="leaf"
          size={100}
          color={C.green}
        />

      </View>


      {/* ================================================= */}
      {/* TÊN CÂY */}
      {/* ================================================= */}

      <View style={s.nameRow}>

        <Text style={s.name}>
          {plant.name}
        </Text>

        <View style={s.chip}>

          <Text
            style={{
              color: sv.statusColor,
              fontWeight: '700',
            }}
          >
            {sv.statusLabel}

          </Text>

        </View>

      </View>


      <Text style={s.sub}>
        Thiết bị: {plant.device_id || '--'}
      </Text>


      <Text style={s.updated}>

        Cập nhật:{' '}

        {p.last_updated && sv.hasData

          ? `${new Date(
              p.last_updated * 1000
            ).toLocaleString('vi-VN')} (${ageInfo(p.last_updated, nowSec).text})${ageInfo(p.last_updated, nowSec).stale ? ' ⚠ dữ liệu cũ' : ''}`

          : 'Chưa có dữ liệu từ ESP32'}

      </Text>


      {/* ================================================= */}
      {/* TIÊU ĐỀ BIỂU ĐỒ */}
      {/* ================================================= */}

      <Text style={s.chartTitle}>
        Biểu đồ cảm biến
      </Text>


      {/* ================================================= */}
      {/* CHỌN CẢM BIẾN */}
      {/* ================================================= */}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.sensorTabs}
      >

        {sensorOptions.map((sensor) => {

          const active =
            selectedSensor === sensor.key;

          return (

            <Pressable
              key={sensor.key}

              style={[
                s.sensorTab,

                active &&
                  s.sensorTabActive,
              ]}

              onPress={() =>
                setSelectedSensor(
                  sensor.key
                )
              }
            >

              <Ionicons
                name={sensor.icon}
                size={18}

                color={
                  active
                    ? '#fff'
                    : C.green
                }
              />

              <Text
                style={[
                  s.sensorTabText,

                  active &&
                    s.sensorTabTextActive,
                ]}
              >
                {sensor.shortTitle}
              </Text>

            </Pressable>

          );

        })}

      </ScrollView>


      {/* ================================================= */}
      {/* HEADER BIỂU ĐỒ */}
      {/* ================================================= */}

      <View style={s.chartHeader}>

        <View style={s.chartIcon}>

          <Ionicons
            name={selectedSensorInfo.icon}
            size={22}
            color={C.green}
          />

        </View>


        <View style={{ flex: 1 }}>

          <Text style={s.chartSensorName}>
            {selectedSensorInfo.title}
          </Text>

          <Text style={s.chartSensorUnit}>

            Đơn vị: {selectedSensorInfo.unit}

            {'   '}

            Thang: {selectedSensorInfo.min}
            {' - '}
            {selectedSensorInfo.max}

          </Text>

        </View>


        {/* GIÁ TRỊ HIỆN TẠI */}

        <View style={s.currentValueBox}>

          <Text style={s.currentValue}>

            {currentValue}

          </Text>

        </View>

      </View>


      {/* ================================================= */}
      {/* BIỂU ĐỒ */}
      {/* ================================================= */}

      <View style={s.rangeRow}>
        {RANGES.map((r) => {
          const active = range === r.key;
          return (
            <Pressable
              key={r.key}
              style={[s.rangeTab, active && s.rangeTabActive]}
              onPress={() => setRange(r.key)}
            >
              <Text style={[s.rangeText, active && { color: '#fff' }]}>
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.chartBox}>
        <SimpleLineChart
          data={chartData}
          xLabels={xLabels}
          min={selectedSensorInfo.min}
          max={selectedSensorInfo.max}
          unit={selectedSensorInfo.unit}
        />
      </View>


      {/* ================================================= */}
      {/* CẢM BIẾN HIỆN TẠI */}
      {/* ================================================= */}

      <View style={{ marginHorizontal: -20, marginTop: 16 }}>
        <SensorOverview sv={sv} />
      </View>


      {/* ================================================= */}
      {/* TƯỚI NGAY */}
      {/* ================================================= */}

      {readControl(plant).auto_watering && (
        <Text style={s.hint}>
          Tự động tưới: bật • dưới {readControl(plant).auto_threshold}% → bơm {readControl(plant).pump_seconds} giây
        </Text>
      )}

      <Pressable
        style={[s.waterButton, (watering || p.pump_status) && { opacity: 0.75 }]}
        onPress={handleWaterNow}
        disabled={watering || !!p.pump_status}
      >
        <Ionicons
          name="water"
          size={20}
          color="#fff"
        />

        <Text style={s.waterButtonText}>
          {p.pump_status
            ? 'Đang tưới...'
            : watering
              ? 'Đã gửi lệnh...'
              : 'Tưới ngay'}
        </Text>
      </Pressable>

      {p.pump_ready === false && (
        <Text style={[s.hint, { color: C.red }]}>
          ⚠ Firmware chưa bật bơm (PUMP_PIN = -1) nên lệnh tưới chưa có tác dụng.
        </Text>
      )}


    </ScrollView>

  );

}


// =====================================================
// STYLE
// =====================================================

const s = StyleSheet.create({

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },


  hero: {
    height: 210,
    borderRadius: 24,
    backgroundColor: C.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },


  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },


  name: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
  },


  chip: {
    backgroundColor: C.paleGreen,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },


  sub: {
    color: C.gray,
  },


  updated: {
    color: C.gray,
    marginTop: 3,
    fontSize: 12,
  },


  chartTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 10,
    color: '#222',
  },


  // ===================================================
  // SENSOR TABS
  // ===================================================

  sensorTabs: {
    gap: 8,
    paddingBottom: 4,
  },


  sensorTab: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDE5DD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },


  sensorTabActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },


  sensorTabText: {
    color: C.green,
    fontSize: 13,
    fontWeight: '700',
  },


  sensorTabTextActive: {
    color: '#fff',
  },


  // ===================================================
  // CHART HEADER
  // ===================================================

  chartHeader: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },


  chartIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },


  chartSensorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#222',
  },


  chartSensorUnit: {
    color: C.gray,
    fontSize: 12,
    marginTop: 2,
  },


  // ===================================================
  // CURRENT VALUE
  // ===================================================

  currentValueBox: {
    alignItems: 'flex-end',
  },


  currentValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.green,
  },


  currentUnit: {
    fontSize: 11,
    color: C.gray,
  },


  // ===================================================
  // CHART
  // ===================================================

  chartBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },


  // ===================================================
  // SENSOR GRID
  // ===================================================

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },


  // ===================================================
  // WATER BUTTON
  // ===================================================

  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },

  rangeTab: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDE5DD',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rangeTabActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },

  rangeText: {
    color: C.green,
    fontWeight: '700',
    fontSize: 13,
  },

  hint: {
    marginTop: 14,
    color: C.gray,
    fontSize: 12.5,
    textAlign: 'center',
  },

  waterButton: {
    marginTop: 20,
    backgroundColor: C.blue,
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },


  waterButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

});