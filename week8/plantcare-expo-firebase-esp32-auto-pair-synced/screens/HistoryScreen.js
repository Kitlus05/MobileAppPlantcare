import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { PageTitle, HistoryItem } from '../components/Common';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';

export default function HistoryScreen() {
  const { user } = useAuth();
  const [plantIds, setPlantIds] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `users/${user.uid}/plant_ids`), (snap) => {
      const v = snap.val();
      setPlantIds(Array.isArray(v) ? v.filter(Boolean) : v && typeof v === 'object' ? Object.values(v).filter(Boolean) : []);
    }, () => setLoading(false));
  }, [user]);

  // Gộp lịch sử chẩn đoán AI (diagnosis_history) của tất cả cây user sở hữu
  useEffect(() => {
    if (!plantIds.length) {
      setLoading(false);
      return;
    }
    const unsubs = plantIds.map((pid) =>
      onValue(ref(db, `diagnosis_history/${pid}`), (snap) => {
        const data = snap.val() || {};
        const entries = Object.entries(data).map(([ts, v]) => ({
          id: `${pid}_${ts}`,
          plantId: pid,
          timestamp: Number(ts),
          result: v.result,
          confidence: v.confidence,
        }));
        setItems((prev) => {
          const others = prev.filter((x) => x.plantId !== pid);
          return [...others, ...entries].sort((a, b) => b.timestamp - a.timestamp);
        });
        setLoading(false);
      }, () => setLoading(false))
    );
    return () => unsubs.forEach((u) => u());
  }, [plantIds]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageTitle title="Lịch sử" subtitle="Kết quả chẩn đoán AI theo thời gian" />
      {loading ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
          {items.length === 0 && (
            <Text style={{ textAlign: 'center', color: C.gray, marginTop: 20 }}>Chưa có lịch sử chẩn đoán.</Text>
          )}
          {items.map((it) => (
            <HistoryItem
              key={it.id}
              icon={it.result === 'Diseased' ? 'warning-outline' : 'leaf'}
              title={it.result === 'Diseased' ? 'Phát hiện bệnh' : 'Cây khỏe mạnh'}
              subtitle={`${new Date(it.timestamp * 1000).toLocaleString('vi-VN')} • Độ tin cậy ${Math.round((it.confidence || 0) * 100)}%`}
              color={it.result === 'Diseased' ? C.red : C.green}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
