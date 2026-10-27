import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { PageTitle } from '../components/Common';
import { auth } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';

function Row({ icon, text, switchValue, onChange, onPress, danger }) {
  return (
    <Pressable style={s.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={22} color={danger ? C.red : C.green} />
      <Text style={[s.text, danger && { color: C.red }]}>{text}</Text>
      {switchValue !== undefined ? (
        <Switch value={switchValue} onValueChange={onChange} trackColor={{ true: '#9DCE9F' }} thumbColor={switchValue ? C.green : undefined} />
      ) : onPress ? null : (
        <Ionicons name="chevron-forward" size={20} color="#8A918A" />
      )}
    </Pressable>
  );
}
function Section({ title, children }) {
  return (
    <View>
      <Text style={s.section}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const [a, setA] = useState(true), [b, setB] = useState(true), [d, setD] = useState(false);

  function handleLogout() {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 30 }}>
      <PageTitle title="Cài đặt" />
      <View style={s.profile}>
        <View style={s.avatar}>
          <Ionicons name="person" size={22} color={C.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bold}>{user?.email || 'User'}</Text>
          <Text style={s.sub}>Đã đăng nhập</Text>
        </View>
      </View>
      <Section title="TÀI KHOẢN">
        <Row icon="person-outline" text="Thông tin cá nhân" />
        <Row icon="lock-closed-outline" text="Đổi mật khẩu" />
      </Section>
      <Section title="NHẮC NHỞ">
        <Row icon="notifications-outline" text="Nhắc tưới cây" switchValue={a} onChange={setA} />
        <Row icon="calendar-outline" text="Lịch chăm sóc" switchValue={b} onChange={setB} />
      </Section>
      <Section title="HIỂN THỊ">
        <Row icon="language-outline" text="Ngôn ngữ • Tiếng Việt" />
        <Row icon="moon-outline" text="Chế độ tối" switchValue={d} onChange={setD} />
      </Section>
      <Section title="ỨNG DỤNG">
        <Row icon="information-circle-outline" text="Phiên bản • 1.0.0" />
        <Row icon="help-circle-outline" text="Trợ giúp" />
      </Section>
      <View style={{ marginTop: 10 }}>
        <Row icon="log-out-outline" text="Đăng xuất" onPress={handleLogout} danger />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  profile: { marginHorizontal: 20, marginBottom: 10, padding: 14, backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff' },
  text: { flex: 1, fontSize: 15 },
  section: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 5, color: C.green, fontSize: 12, fontWeight: '900' },
  bold: { fontWeight: '800', fontSize: 16 },
  sub: { color: C.gray, fontSize: 13, marginTop: 2 },
});
