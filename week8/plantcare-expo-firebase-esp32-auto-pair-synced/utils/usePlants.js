import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebaseConfig';
import { normalizeSettings } from './settings';

export function normalizePlantIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

// Theo dõi profile + danh sách cây của user (realtime).
export function usePlants(user) {
  const [userData, setUserData] = useState({});
  const [plants, setPlants] = useState({});
  const [loading, setLoading] = useState(true);

  const plantIds = useMemo(() => normalizePlantIds(userData.plant_ids), [userData.plant_ids]);
  const idsKey = plantIds.join(',');

  useEffect(() => {
    if (!user) return undefined;
    return onValue(
      ref(db, `users/${user.uid}`),
      (snap) => {
        setUserData(snap.val() || {});
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const ids = idsKey ? idsKey.split(',') : [];
    const next = {};
    setPlants({});

    const unsubs = ids.map((id) =>
      onValue(ref(db, `plants/${id}`), (snap) => {
        const v = snap.val();
        if (v) next[id] = v;
        else delete next[id];
        setPlants({ ...next });
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user, idsKey]);

  return { userData, plantIds, plants, settings: normalizeSettings(userData.settings), loading };
}
