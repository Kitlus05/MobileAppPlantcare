import React, { useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ref, update } from 'firebase/database';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';
import { usePlants } from '../utils/usePlants';
import {
  DAY_LABELS,
  MAX_TIMES,
  pad2,
  normalizeTimes,
  serializeSchedule,
  summarizeSchedule,
} from '../utils/settings';
import { ensurePermission, remindersAvailable } from '../utils/reminders';
import { readControl, saveControl, THRESHOLD_RANGE, PUMP_SECONDS_RANGE } from '../utils/control';

/* ---------- thành phần nhỏ dùng chung ---------- */

function Toggle({ value, onChange }) {
  return (
    <View style={s.switchBox}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#9DCE9F' }} thumbColor={value ? C.green : undefined} />
    </View>
  );
}

function Head({ icon, title, sub, right }) {
  return (
    <View style={s.head}>
      <View style={s.headIcon}>
        <Ionicons name={icon} size={20} color={C.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.headTitle}>{title}</Text>
        {!!sub && <Text style={s.headSub} numberOfLines={2}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

function Stepper({ label, value, unit, onMinus, onPlus }) {
  return (
    <View style={s.stepRow}>
      <Text style={s.stepLabel}>{label}</Text>
      <View style={s.stepper}>
        <Pressable style={s.stepBtn} onPress={onMinus} hitSlop={8}>
          <Ionicons name="remove" size={18} color={C.green} />
        </Pressable>
        <Text style={s.stepValue}>{value}{unit}</Text>
        <Pressable style={s.stepBtn} onPress={onPlus} hitSlop={8}>
          <Ionicons name="add" size={18} color={C.green} />
        </Pressable>
      </View>
    </View>
  );
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- màn hình ---------- */

export default function WateringSettings() {
  const { user } = useAuth();
  const { plantIds, plants, settings } = usePlants(user);

  const [selId, setSelId] = useState(null);
  const [draftH, setDraftH] = useState(7);
  const [draftM, setDraftM] = useState(0);

  const sch = settings.schedule;
  const activePlantId = plantIds.includes(selId) ? selId : plantIds[0];
  const plant = activePlantId ? plants[activePlantId] : null;
  const ctl = readControl(plant);
  const pumpReady = plant?.current_data?.pump_ready;

  const saveSettings = (patch) =>
    update(ref(db, `users/${user.uid}/settings`), patch).catch((e) =>
      Alert.alert('Không lưu được cài đặt', e?.message || 'Vui lòng thử lại.')
    );

  const saveSchedule = (next) => saveSettings({ schedule: serializeSchedule(next) });

  async function askPermission() {
    if (!remindersAvailable) {
      Alert.alert('Chưa cài thông báo', 'Chạy lệnh: npx expo install expo-notifications rồi khởi động lại app.');
      return false;
    }
    const ok = await ensurePermission();
    if (!ok) Alert.alert('Chưa cấp quyền', 'Hãy bật thông báo cho PlantCare trong Cài đặt của điện thoại.');
    return ok;
  }

  async function toggleReminder(v) {
    if (v && !(await askPermission())) return;
    saveSettings({ reminder_enabled: v });
  }

  async function toggleSchedule(v) {
    if (v && !(await askPermission())) return;
    saveSchedule({ ...sch, enabled: v });
  }

  const toggleDay = (i) => saveSchedule({ ...sch, days: sch.days.map((d, k) => (k === i ? !d : d)) });

  function addTime() {
    const t = `${pad2(draftH)}:${pad2(draftM)}`;
    if (sch.times.includes(t)) return Alert.alert('Giờ này đã có trong lịch');
    if (sch.times.length >= MAX_TIMES) return Alert.alert(`Tối đa ${MAX_TIMES} khung giờ mỗi ngày`);
    saveSchedule({ ...sch, times: normalizeTimes([...sch.times, t]) });
  }

  const removeTime = (t) => saveSchedule({ ...sch, times: sch.times.filter((x) => x !== t) });

  const setControl = (patch) => activePlantId && saveControl(activePlantId, patch).catch((e) => Alert.alert('Không lưu được', e?.message || ''));

  return (
    <View style={{ gap: 12 }}>
      {/* ---------- NHẮC NHỞ ---------- */}
      <View style={s.card}>
        <Head
          icon="notifications-outline"
          title="Nhắc tưới cây"
          sub="Báo ngay khi cây khô (lúc đang mở app) và nhắc theo lịch bên dưới"
          right={<Toggle value={settings.reminder_enabled} onChange={toggleReminder} />}
        />
      </View>

      {/* ---------- LỊCH TƯỚI ---------- */}
      <View style={s.card}>
        <Head
          icon="calendar-outline"
          title="Lịch tưới cây"
          sub={summarizeSchedule({ ...sch, enabled: sch.enabled && settings.reminder_enabled })}
          right={<Toggle value={sch.enabled} onChange={toggleSchedule} />}
        />

        {sch.enabled && (
          <View style={s.body}>
            <Text style={s.label}>Ngày trong tuần</Text>
            <View style={s.daysRow}>
              {DAY_LABELS.map((d, i) => (
                <Pressable key={d} onPress={() => toggleDay(i)} style={[s.day, sch.days[i] && s.dayOn]}>
                  <Text style={[s.dayText, sch.days[i] && { color: '#fff' }]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.label, { marginTop: 14 }]}>Giờ nhắc ({sch.times.length}/{MAX_TIMES})</Text>
            <View style={s.timesRow}>
              {sch.times.length === 0 && <Text style={s.empty}>Chưa có giờ nào</Text>}
              {sch.times.map((t) => (
                <View key={t} style={s.timeChip}>
                  <Ionicons name="time-outline" size={15} color={C.green} />
                  <Text style={s.timeText}>{t}</Text>
                  <Pressable onPress={() => removeTime(t)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#9AA39A" />
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={s.addTime}>
              <Stepper label="Giờ" value={pad2(draftH)} unit="" onMinus={() => setDraftH((h) => (h + 23) % 24)} onPlus={() => setDraftH((h) => (h + 1) % 24)} />
              <Stepper label="Phút" value={pad2(draftM)} unit="" onMinus={() => setDraftM((m) => (m + 55) % 60)} onPlus={() => setDraftM((m) => (m + 5) % 60)} />
              <Pressable style={s.addBtn} onPress={addTime}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={s.addBtnText}>Thêm {pad2(draftH)}:{pad2(draftM)}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ---------- TỰ ĐỘNG TƯỚI ---------- */}
      <View style={s.card}>
        <Head
          icon="water-outline"
          title="Tự động tưới"
          sub={
            !plant
              ? 'Cần ghép ít nhất một cây'
              : ctl.auto_watering
                ? `Bơm ${ctl.pump_seconds}s khi độ ẩm đất < ${ctl.auto_threshold}%`
                : 'Đang tắt'
          }
          right={plant ? <Toggle value={ctl.auto_watering} onChange={(v) => setControl({ auto_watering: v, updated_at: Date.now() })} /> : null}
        />

        {plant && (
          <View style={s.body}>
            {plantIds.length > 1 && (
              <View style={[s.timesRow, { marginBottom: 10 }]}>
                {plantIds.map((id) => (
                  <Pressable key={id} onPress={() => setSelId(id)} style={[s.day, { width: undefined, paddingHorizontal: 14 }, id === activePlantId && s.dayOn]}>
                    <Text style={[s.dayText, id === activePlantId && { color: '#fff' }]}>{plants[id]?.name || id}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Stepper
              label="Tưới khi độ ẩm đất dưới"
              value={ctl.auto_threshold}
              unit="%"
              onMinus={() => setControl({ auto_threshold: clamp(ctl.auto_threshold - THRESHOLD_RANGE.step, THRESHOLD_RANGE.min, THRESHOLD_RANGE.max) })}
              onPlus={() => setControl({ auto_threshold: clamp(ctl.auto_threshold + THRESHOLD_RANGE.step, THRESHOLD_RANGE.min, THRESHOLD_RANGE.max) })}
            />
            <Stepper
              label="Thời gian bơm mỗi lần"
              value={ctl.pump_seconds}
              unit="s"
              onMinus={() => setControl({ pump_seconds: clamp(ctl.pump_seconds - PUMP_SECONDS_RANGE.step, PUMP_SECONDS_RANGE.min, PUMP_SECONDS_RANGE.max) })}
              onPlus={() => setControl({ pump_seconds: clamp(ctl.pump_seconds + PUMP_SECONDS_RANGE.step, PUMP_SECONDS_RANGE.min, PUMP_SECONDS_RANGE.max) })}
            />

            <Text style={s.note}>
              Giữa hai lần tự tưới, thiết bị nghỉ tối thiểu 15 phút để tránh tưới quá nhiều.
            </Text>
            {pumpReady === false && (
              <Text style={[s.note, { color: C.red, fontWeight: '700' }]}>
                ⚠ Firmware chưa bật bơm (PUMP_PIN = -1) nên tưới tự động chưa hoạt động.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 20, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  head: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.paleGreen, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 15.5, fontWeight: '700', color: '#222' },
  headSub: { fontSize: 12.5, color: C.gray, marginTop: 2 },
  switchBox: { width: 56, alignItems: 'flex-end', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8ECE6', paddingTop: 14 },
  label: { fontSize: 12.5, fontWeight: '700', color: '#444', marginBottom: 8 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 36, borderRadius: 18, backgroundColor: '#F2F5F1', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.green },
  dayText: { fontSize: 12.5, fontWeight: '700', color: C.green },
  timesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: C.paleGreen },
  timeText: { fontWeight: '700', color: C.darkGreen },
  empty: { color: C.gray, fontSize: 13 },
  addTime: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#F7FAF4', gap: 8 },
  addBtn: { marginTop: 4, height: 42, borderRadius: 12, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addBtnText: { color: '#fff', fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  stepLabel: { flex: 1, fontSize: 14, color: '#2B302B', paddingRight: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F5F1', borderRadius: 12, padding: 3 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 52, textAlign: 'center', fontWeight: '800', color: C.darkGreen, fontSize: 15 },
  note: { marginTop: 8, color: C.gray, fontSize: 12 },
});
