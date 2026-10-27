import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onValue, ref } from 'firebase/database';
import { PageTitle, PlantCard, SensorCard } from '../components/Common';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';

function normalizePlantIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
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
        status: plant.current_data?.status || '...',
      },
    };
  }).filter(Boolean);

  const selected = plantList[0];
  const cd = selected?.raw?.current_data || {};

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 25 }}>
      <View style={s.header}>
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
          <View style={s.grid}>
            <SensorCard icon="water" title="Độ ẩm đất" value={`${cd.soil_moisture ?? '--'}%`} color={C.blue} />
            <SensorCard icon="thermo" title="Nhiệt độ" value={`${cd.temperature ?? '--'}°C`} color={C.orange} />
            <SensorCard icon="air" title="Độ ẩm không khí" value={`${cd.humidity ?? '--'}%`} color={C.blue} />
            <SensorCard icon="sun" title="Ánh sáng" value={`${cd.light ?? '--'}%`} color={C.orange} />
            <SensorCard icon="water-outline" title="Mực nước" value={`${cd.water_level ?? '--'}%`} color={C.blue} />
          </View>
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
  grid: { paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emptyCard: { backgroundColor: C.white, borderRadius: 20, padding: 24, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '800', color: C.darkGreen },
  emptyText: { marginTop: 5, color: C.gray, textAlign: 'center' },
  addButton: { marginTop: 16, paddingHorizontal: 18, height: 44, borderRadius: 13, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  addButtonText: { color: '#fff', fontWeight: '700' },
});
