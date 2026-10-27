import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onValue, ref } from 'firebase/database';
import { PageTitle, PlantCard, SensorOverview } from '../components/Common';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';
import { parseSensor } from '../utils/sensors';
import { useServerClock, ageInfo } from '../utils/useServerClock';

function normalizePlantIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const nowSec = useServerClock();
  const [selectedId, setSelectedId] = useState(null);
  const [userName, setUserName] = useState('User');
  const [plantIds, setPlantIds] = useState([]);
  const [plants, setPlants] = useState({});
  const [loading, setLoading] = useState(true);

  // Theo dõi profile + danh sách ID cây của user.
  useEffect(() => {
    if (!user) return undefined;
    return onValue(ref(db, `users/${user.uid}`), (snap) => {
      const data = snap.val() || {};
      setUserName(data.name || 'User');
      setPlantIds(normalizePlantIds(data.plant_ids));
    });
  }, [user]);

  // Theo dõi từng cây realtime. Không đọc toàn bộ /plants.
  useEffect(() => {
    if (!user) return undefined;

    const unsubscribers = [];
    const nextPlants = {};
    setLoading(plantIds.length > 0);

    plantIds.forEach((plantId) => {
      const unsubscribe = onValue(ref(db, `plants/${plantId}`), (snap) => {
        const value = snap.val();
        if (value) nextPlants[plantId] = value;
        else delete nextPlants[plantId];
        setPlants({ ...nextPlants });
        setLoading(false);
      }, () => setLoading(false));
      unsubscribers.push(unsubscribe);
    });

    if (plantIds.length === 0) {
      setPlants({});
      setLoading(false);
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, plantIds]);

  const plantList = plantIds.map((id) => {
    const plant = plants[id];
    if (!plant) return null;
    return {
      id,
      raw: plant,
      card: {
        id,
        name: plant.name || 'Cây chưa đặt tên',
        type: plant.name || 'Cây trồng',
        moisture: plant.current_data?.soil_moisture ?? 0,
        moistureText: parseSensor(plant.current_data).soil,
        statusLabel: parseSensor(plant.current_data).statusLabel,
        statusColor: parseSensor(plant.current_data).statusColor,
        status: plant.current_data?.status || '...',
      },
    };
  }).filter(Boolean);

  const selected = plantList.find((p) => p.id === selectedId) || plantList[0];
  const sv = parseSensor(selected?.raw?.current_data);
  const age = ageInfo(selected?.raw?.current_data?.last_updated, nowSec);
  const showStale = !!selected && sv.hasData && age.stale;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 25 }}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.avatar}>
          <Ionicons name="person" size={21} color={C.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>Xin chào, {userName}!</Text>
          <Text style={s.greet}>Chúc cây của bạn luôn khỏe 🌱</Text>
        </View>
        <Ionicons name="notifications-outline" size={25} color="#303530" onPress={() => navigation.navigate('Notifications')} />
      </View>

      <PageTitle title="Cây của tôi" subtitle={`${plantList.length} cây đang được quản lý`} />
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {loading && plantList.length === 0 ? (
          <ActivityIndicator color={C.green} style={{ padding: 20 }} />
        ) : plantList.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="leaf-outline" size={42} color={C.green} />
            <Text style={s.emptyTitle}>Bạn chưa có cây nào</Text>
            <Text style={s.emptyText}>Thêm cây để bắt đầu theo dõi dữ liệu cảm biến.</Text>
            <Pressable style={s.addButton} onPress={() => navigation.navigate('Plants')}>
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={s.addButtonText}>Thêm cây</Text>
            </Pressable>
          </View>
        ) : (
          plantList.map(({ id, card }) => (
            <PlantCard
              key={id}
              plant={card}
              onPress={() => navigation.navigate('Plants', { screen: 'PlantDetail', params: { plantId: id } })}
            />
          ))
        )}
      </View>

      {selected && (
        <>
          <PageTitle title="Thông tin nhanh" />
          {plantList.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {plantList.map(({ id, raw }) => {
                const active = id === selected.id;
                return (
                  <Pressable key={id} onPress={() => setSelectedId(id)} style={[s.chip, active && s.chipActive]}>
                    <Text style={[s.chipText, active && { color: '#fff' }]}>{raw.name || id}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={s.metaRow}>
            <Text style={s.metaText}>
              {selected.raw.name || 'Cây'} • {selected.raw.device_id || '--'}
            </Text>
            <Text style={[s.metaText, showStale ? { color: C.red, fontWeight: '800' } : { color: C.green }]}>
              {showStale ? `⚠ Dữ liệu cũ (${age.text})` : sv.hasData ? `Cập nhật ${age.text}` : 'Chờ ESP32 gửi dữ liệu'}
            </Text>
          </View>
          <SensorOverview sv={sv} />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { padding: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 18, fontWeight: '800' },
  greet: { color: C.gray },
  chips: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5DD', justifyContent: 'center' },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.green, fontWeight: '700', fontSize: 13 },
  metaRow: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metaText: { color: C.gray, fontSize: 12 },
  grid: { paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emptyCard: { backgroundColor: C.white, borderRadius: 20, padding: 24, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '800', color: C.darkGreen },
  emptyText: { marginTop: 5, color: C.gray, textAlign: 'center' },
  addButton: { marginTop: 16, paddingHorizontal: 18, height: 44, borderRadius: 13, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  addButtonText: { color: '#fff', fontWeight: '700' },
});
