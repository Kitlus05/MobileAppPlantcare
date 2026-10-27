import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { PageTitle, Notice } from '../components/Common';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';

const ICON_MAP = {
  watering_reminder: 'water',
  fertilizing_reminder: 'leaf',
  disease_alert: 'warning-outline',
  sensor_alert: 'warning-outline',
};
const LABEL_MAP = {
  watering_reminder: 'Đến giờ tưới cây',
  fertilizing_reminder: 'Đến giờ bón phân',
  disease_alert: 'Cảnh báo bệnh cây',
  sensor_alert: 'Cảnh báo cảm biến',
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `notifications/${user.uid}`), (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setItems(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  const colorFor = (type) => ({
    watering_reminder: C.blue,
    fertilizing_reminder: C.green,
    disease_alert: C.red,
    sensor_alert: C.orange,
  }[type] || C.green);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageTitle title="Thông báo" subtitle="Cập nhật mới nhất về khu vườn" />
      {loading ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
          {items.length === 0 && (
            <Text style={{ textAlign: 'center', color: C.gray, marginTop: 20 }}>Chưa có thông báo nào.</Text>
          )}
          {items.map((it) => (
            <Notice
              key={it.id}
              icon={ICON_MAP[it.type] || 'notifications-outline'}
              title={LABEL_MAP[it.type] || 'Thông báo'}
              text={it.message || ''}
              color={colorFor(it.type)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
