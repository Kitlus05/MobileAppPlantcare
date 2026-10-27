import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ref, onValue, set, query, limitToLast } from 'firebase/database';
import { SensorCard, SimpleLineChart } from '../components/Common';
import { db } from '../firebaseConfig';
import { C } from '../styles';

export default function PlantDetailScreen({ route, navigation }) {
  const { plantId } = route.params || {};
  const [plant, setPlant] = useState(null);
  const [history, setHistory] = useState([]);
  const [watering, setWatering] = useState(false);

  useEffect(() => {
    if (!plantId) return;
    return onValue(ref(db, `plants/${plantId}`), (snap) => {
      const data = snap.val();
      setPlant(data);
      if (data?.name) navigation.setOptions({ title: data.name });
    });
  }, [plantId]);

  // Lấy 12 bản ghi gần nhất trong sensor_history để vẽ biểu đồ độ ẩm đất
  useEffect(() => {
    if (!plantId) return;
    const histRef = query(ref(db, `sensor_history/${plantId}`), limitToLast(12));
    return onValue(histRef, (snap) => {
      const data = snap.val() || {};
      const entries = Object.entries(data)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, v]) => (v.soil_moisture ?? 0) / 100);
      setHistory(entries);
    });
  }, [plantId]);

  async function handleWaterNow() {
    if (!plantId) return;
    setWatering(true);
    try {
      await set(ref(db, `plants/${plantId}/commands`), { water_now: true, updated_at: Date.now() });
    } finally {
      setWatering(false);
    }
  }

  if (!plant) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }

  const p = plant.current_data || {};

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
      <View style={s.hero}>
        <Ionicons name="leaf" size={100} color={C.green} />
      </View>
      <View style={s.nameRow}>
        <Text style={s.name}>{plant.name}</Text>
        <View style={s.chip}>
          <Text style={{ color: C.green, fontWeight: '700' }}>{p.status || '...'}</Text>
        </View>
      </View>
      <Text style={s.sub}>Thiết bị: {plant.device_id || '--'}</Text>
      <Text style={s.updated}>
        Cập nhật: {p.last_updated ? new Date(p.last_updated * 1000).toLocaleString('vi-VN') : '--'}
      </Text>

      <Text style={s.chartTitle}>Độ ẩm đất (%)</Text>
      <SimpleLineChart data={history.length ? history : undefined} />

      <View style={s.grid}>
        <SensorCard icon="water" title="Độ ẩm đất" value={`${p.soil_moisture ?? '--'}%`} color={C.blue} />
        <SensorCard icon="thermo" title="Nhiệt độ" value={`${p.temperature ?? '--'}°C`} color={C.orange} />
        <SensorCard icon="air" title="Không khí" value={`${p.humidity ?? '--'}%`} color={C.blue} />
        <SensorCard icon="sun" title="Ánh sáng" value={`${p.light ?? '--'}%`} color={C.orange} />
        <SensorCard icon="water-outline" title="Mực nước" value={`${p.water_level ?? '--'}%`} color={C.blue} />
      </View>

      <Pressable style={s.waterButton} onPress={handleWaterNow} disabled={watering}>
        <Ionicons name="water" size={20} color="#fff" />
        <Text style={s.waterButtonText}>{watering ? 'Đang gửi lệnh...' : p.pump_status ? 'Đang tưới...' : 'Tưới ngay'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  hero: { height: 210, borderRadius: 24, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10 },
  name: { flex: 1, fontSize: 24, fontWeight: '800' },
  chip: { backgroundColor: C.paleGreen, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  sub: { color: C.gray },
  updated: { color: C.gray, marginTop: 3, fontSize: 12 },
  chartTitle: { fontSize: 18, fontWeight: '800', marginTop: 22, marginBottom: 10, color: '#222' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  waterButton: { marginTop: 20, backgroundColor: C.blue, borderRadius: 16, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waterButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
