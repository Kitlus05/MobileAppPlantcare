import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { get, onValue, ref, update } from 'firebase/database';
import { PageTitle, PlantCard } from '../components/Common';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';
import { parseSensor, WAITING_STATUS } from '../utils/sensors';

function normalizePlantIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

function makePlantId() {
  return `plant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function PlantsScreen({ navigation }) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState('');
  const [plantName, setPlantName] = useState('');
  const [rawDevices, setRawDevices] = useState([]);
  const [discoveryError, setDiscoveryError] = useState('');
  const [serverOffset, setServerOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [justClaimed, setJustClaimed] = useState({});

  // Lech gio giua dien thoai va server Firebase (de so sanh last_seen chinh xac).
  useEffect(() => {
    return onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
      setServerOffset(Number(snap.val()) || 0);
    });
  }, []);

  // Tinh lai danh sach moi 5 giay de thiet bi mat ket noi tu bien mat.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Lang nghe /device_public. ESP32 tu dang ky vao day sau khi Anonymous Auth.
  useEffect(() => {
    if (!user) return undefined;

    return onValue(ref(db, 'device_public'), (snap) => {
      const value = snap.val() || {};
      setDiscoveryError('');
      setRawDevices(
        Object.entries(value).map(([deviceId, d]) => ({
          id: deviceId,
          device_id: d.device_id || deviceId,
          claimable: d.claimable === true,
          online: d.online === true,
          last_seen: Number(d.last_seen || 0),
        }))
      );
    }, (error) => {
      console.error('Load device discovery error:', error);
      setRawDevices([]);
      setDiscoveryError(error?.message || 'Không đọc được danh sách thiết bị.');
    });
  }, [user]);

  const DISCOVERY_TIMEOUT_SEC = 45;

  const devices = useMemo(() => {
    const now = Math.floor((Date.now() + serverOffset) / 1000);
    return rawDevices
      .filter((d) => {
        const hiddenAt = justClaimed[d.id];
        if (hiddenAt && Date.now() - hiddenAt < 20000) return false;
        return d.claimable && d.online && d.last_seen > 0 && Math.abs(now - d.last_seen) <= DISCOVERY_TIMEOUT_SEC;
      })
      .sort((a, b) => b.last_seen - a.last_seen);
  }, [rawDevices, serverOffset, justClaimed, tick]);

  // Thiet bi thay trong DB nhung khong hien duoc -> giai thich ly do cho nguoi dung.
  const hiddenInfo = useMemo(() => {
    if (devices.length > 0 || rawDevices.length === 0) return '';
    const now = Math.floor((Date.now() + serverOffset) / 1000);
    const parts = rawDevices.map((d) => {
      const age = now - d.last_seen;
      if (!d.claimable) return `${d.device_id}: đã được ghép`;
      if (d.last_seen <= 0 || Math.abs(age) > DISCOVERY_TIMEOUT_SEC) return `${d.device_id}: mất kết nối (${age}s trước)`;
      if (!d.online) return `${d.device_id}: offline`;
      return `${d.device_id}: chờ`;
    });
    return parts.join(' • ');
  }, [devices, rawDevices, serverOffset, tick]);

  // Chi doc cac plant_id cua user, sau do lang nghe tung plant realtime.
  useEffect(() => {
    if (!user) return undefined;

    setLoading(true);
    let plantUnsubscribers = [];

    const userUnsubscribe = onValue(ref(db, `users/${user.uid}/plant_ids`), (snap) => {
      plantUnsubscribers.forEach((unsubscribe) => unsubscribe());
      plantUnsubscribers = [];

      const ids = normalizePlantIds(snap.val());
      if (ids.length === 0) {
        setPlants([]);
        setLoading(false);
        return;
      }

      const nextPlants = new Map();
      ids.forEach((plantId) => {
        const unsubscribe = onValue(ref(db, `plants/${plantId}`), (plantSnap) => {
          const p = plantSnap.val();
          if (!p) {
            nextPlants.delete(plantId);
          } else {
            const sensor = parseSensor(p.current_data);
            nextPlants.set(plantId, {
              id: plantId,
              name: p.name || 'Cây chưa đặt tên',
              type: p.name || 'Cây trồng',
              device_id: p.device_id || '',
              moisture: p.current_data?.soil_moisture ?? 0,
              moistureText: sensor.soil,
              statusLabel: sensor.statusLabel,
              statusColor: sensor.statusColor,
              status: p.current_data?.status || '...',
            });
          }
          setPlants(ids.map((id) => nextPlants.get(id)).filter(Boolean));
          setLoading(false);
        }, () => setLoading(false));
        plantUnsubscribers.push(unsubscribe);
      });
    }, (error) => {
      console.error('Load plants error:', error);
      setPlants([]);
      setLoading(false);
    });

    return () => {
      userUnsubscribe();
      plantUnsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  async function claimDevice(device) {
    if (!user || !device?.id || claiming) return;

    const name = plantName.trim() || `Cây ${device.device_id}`;
    setClaiming(device.id);

    try {
      // Khong doc private device_uid tu app. Firebase Rules se atomic-check
      // claimable/device ownership ngay trong multi-location update ben duoi.
      const idsSnap = await get(ref(db, `users/${user.uid}/plant_ids`));
      const oldIds = normalizePlantIds(idsSnap.val());
      const plantId = makePlantId();
      const now = Date.now();

      const newPlant = {
        name,
        owner_uid: user.uid,
        device_id: device.id,
        created_at: now,
        current_data: {
          soil_moisture: 0,
          temperature: 0,
          humidity: 0,
          light: 0,
          water_level: 0,
          status: WAITING_STATUS,
          device_id: device.id,
          pump_status: false,
          last_updated: Math.floor(now / 1000),
        },
      };

      // Atomic multi-location update:
      // 1) tao plant, 2) them plant vao user, 3) claim device,
      // 4) an device khoi danh sach "dang cho".
      await update(ref(db), {
        [`plants/${plantId}`]: newPlant,
        [`users/${user.uid}/plant_ids`]: [...oldIds, plantId],
        [`devices/${device.id}/owner_uid`]: user.uid,
        [`devices/${device.id}/plant_id`]: plantId,
        [`devices/${device.id}/claimable`]: false,
      });

      setJustClaimed((m) => ({ ...m, [device.id]: Date.now() }));
      setPlantName('');
      Alert.alert('Đã ghép ESP32', `${device.device_id} đã được liên kết với "${name}".`);
    } catch (error) {
      console.error('Claim device error:', error);
      Alert.alert(
        'Không thể ghép thiết bị',
        `${error?.code || error?.message || 'Lỗi không xác định'}\n\nKiểm tra đã deploy database.rules.json và ESP32 đang online.`
      );
    } finally {
      setClaiming('');
    }
  }

  function handleDeletePlant(plantId) {
    if (!user || !plantId) return;

    Alert.alert('Xóa cây', 'Cây sẽ bị xóa khỏi tài khoản. ESP32 trở lại trạng thái chờ ghép.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            const plantSnap = await get(ref(db, `plants/${plantId}`));
            const plant = plantSnap.val() || {};
            const idsSnap = await get(ref(db, `users/${user.uid}/plant_ids`));
            const oldIds = normalizePlantIds(idsSnap.val());
            const updates = {
              [`plants/${plantId}`]: null,
              [`users/${user.uid}/plant_ids`]: oldIds.filter((id) => id !== plantId),
            };

            // Neu plant dang gan device, tra device ve trang thai cho ghep.
            if (plant.device_id) {
              updates[`devices/${plant.device_id}/owner_uid`] = null;
              updates[`devices/${plant.device_id}/plant_id`] = null;
              updates[`devices/${plant.device_id}/claimable`] = true;
            }

            await update(ref(db), updates);
          } catch (error) {
            console.error('Delete plant error:', error);
            Alert.alert('Lỗi', 'Không thể xóa cây. Kiểm tra Firebase Rules và thử lại.');
          }
        },
      },
    ]);
  }

  const list = plants.filter((p) =>
    `${p.name} ${p.type} ${p.device_id}`.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageTitle title="Cây trồng" subtitle="Đăng nhập là ESP32 tự xuất hiện để ghép" />

      {devices.length > 0 && (
        <View style={s.discoveryCard}>
          <View style={s.discoveryHeader}>
            <View style={s.discoveryIcon}>
              <Ionicons name="bluetooth-outline" size={23} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.discoveryTitle}>ESP32 được tìm thấy</Text>
              <Text style={s.discoveryText}>Thiết bị mới đang chờ tài khoản của bạn ghép.</Text>
            </View>
          </View>

          {devices.map((device) => (
            <View key={device.id} style={s.deviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.deviceName}>{device.device_id}</Text>
                <Text style={s.deviceMeta}>{device.online ? 'Đang online' : 'Vừa online'}</Text>
              </View>
              <Pressable
                style={s.pairButton}
                onPress={() => claimDevice({ ...device, suggestedName: `Cây ${device.device_id}` })}
                disabled={claiming === device.id}
              >
                {claiming === device.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={17} color="#fff" />
                    <Text style={s.pairButtonText}>Ghép</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))}

          <TextInput
            value={plantName}
            onChangeText={setPlantName}
            placeholder="Tên cây cho lần ghép tiếp theo (không bắt buộc)"
            style={s.nameInput}
          />
        </View>
      )}

      <View style={s.topRow}>
        <View style={s.search}>
          <Ionicons name="search" size={21} color={C.gray} />
          <TextInput value={q} onChangeText={setQ} placeholder="Tìm kiếm cây..." style={{ flex: 1 }} />
        </View>
        <View style={s.searchHint}>
          <Ionicons name="radio-outline" size={20} color={C.green} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 30 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={devices.length ? 'link-outline' : 'leaf-outline'} size={42} color={C.green} />
              <Text style={s.emptyTitle}>
                {devices.length ? 'Ghép ESP32 để tạo cây' : q ? 'Không tìm thấy cây' : 'Chưa có cây nào'}
              </Text>
              <Text style={s.emptyText}>
                {devices.length
                  ? 'ESP32 đang online sẽ tự xuất hiện ở phía trên.'
                  : discoveryError
                    ? `Lỗi đọc thiết bị: ${discoveryError}\n(Thường do chưa deploy Firebase Rules mới.)`
                    : hiddenInfo
                      ? `Đã thấy thiết bị nhưng chưa ghép được → ${hiddenInfo}`
                      : 'Chưa thấy ESP32 nào. Bật ESP32, kết nối Wi‑Fi và đợi vài giây.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.plantRow}>
              <View style={{ flex: 1 }}>
                <PlantCard
                  plant={item}
                  onPress={() => navigation.navigate('PlantDetail', { plantId: item.id })}
                />
              </View>
              <Pressable
                style={s.deleteButton}
                onPress={() => handleDeletePlant(item.id)}
                accessibilityLabel={`Xóa ${item.name}`}
              >
                <Ionicons name="trash-outline" size={21} color={C.red} />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  discoveryCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDEBDD',
  },
  discoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  discoveryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  discoveryTitle: { fontSize: 16, fontWeight: '800', color: C.darkGreen },
  discoveryText: { marginTop: 2, color: C.gray, fontSize: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EEF2EE' },
  deviceName: { fontWeight: '800', fontSize: 15 },
  deviceMeta: { color: C.gray, fontSize: 12, marginTop: 2 },
  pairButton: { minWidth: 82, height: 40, borderRadius: 12, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  pairButtonText: { color: '#fff', fontWeight: '800' },
  nameInput: { height: 44, borderRadius: 12, backgroundColor: '#F4F6F3', paddingHorizontal: 13, marginTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  search: { flex: 1, marginLeft: 20, padding: 3, paddingHorizontal: 14, height: 52, borderRadius: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchHint: { width: 52, height: 52, marginHorizontal: 20, marginLeft: 10, borderRadius: 16, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  plantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButton: { width: 48, height: 68, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 45, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 10, color: C.darkGreen },
  emptyText: { color: C.gray, marginTop: 5, textAlign: 'center' },
});
