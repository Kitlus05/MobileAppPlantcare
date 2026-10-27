import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { niceRange, formatTick } from '../utils/chart';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../styles';


/* =========================================================
   PAGE TITLE
========================================================= */

export function PageTitle({ title, subtitle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.title, { paddingTop: insets.top + 12 }]}>
      <Text style={s.h}>
        {title}
      </Text>

      {subtitle && (
        <Text style={s.sub}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}


/* =========================================================
   SENSOR ICON
========================================================= */

const iconMap = {
  water: 'water-outline',
  thermo: 'thermometer-outline',
  air: 'water-outline',
  sun: 'sunny-outline',
  plant: 'leaf-outline',
  history: 'time-outline',
  check: 'leaf',
};


/* =========================================================
   SENSOR CARD
========================================================= */

export function SensorCard({
  icon = 'plant',
  title,
  value,
  color = C.green,
  style,
}) {
  return (
    <View style={[s.sensor, style]}>

      <View style={s.sensorHead}>
        <View style={[s.sensorIcon, { backgroundColor: color + '1F' }]}>
          <Ionicons
            name={iconMap[icon] || icon}
            size={20}
            color={color}
          />
        </View>

        <Text style={s.sensorTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <Text
        style={[s.value, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>

    </View>
  );
}


/* =========================================================
   SENSOR OVERVIEW
   ---------------------------------------------------------
   1 thẻ lớn (độ ẩm đất, cảm biến quan trọng nhất)
   + lưới 2 x 2 (nhiệt độ, độ ẩm KK, ánh sáng, mực nước)
========================================================= */

export function SensorOverview({ sv }) {
  const pct = Math.max(0, Math.min(100, sv.soilNumber ?? 0));

  return (
    <View style={s.overview}>

      <View style={s.soilCard}>

        <View style={s.soilTop}>
          <View style={s.soilTitleRow}>
            <View style={[s.sensorIcon, { backgroundColor: C.blue + '1F' }]}>
              <Ionicons name="water" size={20} color={C.blue} />
            </View>
            <Text style={s.soilTitle}>Độ ẩm đất</Text>
          </View>

          <View style={[s.pill, { backgroundColor: sv.statusColor + '1F' }]}>
            <Text style={[s.pillText, { color: sv.statusColor }]}>
              {sv.statusLabel}
            </Text>
          </View>
        </View>

        <Text style={s.soilValue}>{sv.soil}</Text>

        <View style={s.track}>
          <View
            style={[
              s.fill,
              { width: `${pct}%`, backgroundColor: sv.statusColor },
            ]}
          />
        </View>

      </View>

      <View style={s.grid2}>
        <SensorCard icon="thermo" title="Nhiệt độ" value={sv.temp} color={C.orange} style={s.half} />
        <SensorCard icon="cloud-outline" title="Độ ẩm KK" value={sv.hum} color={C.blue} style={s.half} />
        <SensorCard icon="sun" title="Ánh sáng" value={sv.light} color={C.orange} style={s.half} />
        <SensorCard icon="beaker-outline" title="Mực nước" value={sv.water} color={C.blue} style={s.half} />
      </View>

    </View>
  );
}


/* =========================================================
   PLANT CARD
========================================================= */

export function PlantCard({
  plant,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={s.plant}
    >

      <View style={s.thumb}>
        <Ionicons
          name="leaf"
          size={38}
          color={C.green}
        />
      </View>

      <View style={{ flex: 1 }}>

        <Text style={s.name}>
          {plant.name}
        </Text>

        <Text style={[s.type, plant.statusColor && { color: plant.statusColor, fontWeight: '700' }]}>
          {plant.statusLabel || 'Đang phát triển'}
        </Text>

      </View>

      <Text style={s.moisture}>
        {plant.moistureText ?? `${plant.moisture}%`}
      </Text>

    </Pressable>
  );
}


/* =========================================================
   HISTORY ITEM
========================================================= */

export function HistoryItem({
  icon,
  title,
  subtitle,
  color = C.green,
}) {
  return (
    <View style={s.item}>

      <View
        style={[
          s.circle,
          {
            backgroundColor: color + '1F',
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={color}
        />
      </View>

      <View style={{ flex: 1 }}>

        <Text style={s.name}>
          {title}
        </Text>

        <Text style={s.type}>
          {subtitle}
        </Text>

      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color="#9AA09A"
      />

    </View>
  );
}


/* =========================================================
   NOTICE
========================================================= */

export function Notice({
  icon,
  title,
  text,
  color = C.green,
}) {
  return (
    <View style={s.item}>

      <View
        style={[
          s.circle,
          {
            backgroundColor: color + '1F',
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={color}
        />
      </View>

      <View style={{ flex: 1 }}>

        <Text style={s.name}>
          {title}
        </Text>

        <Text style={s.type}>
          {text}
        </Text>

      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color="#9AA09A"
      />

    </View>
  );
}


/* =========================================================
   LINE CHART (react-native-svg)
   ---------------------------------------------------------
   - Vẽ đường nối + vùng tô, tự ngắt đoạn khi có điểm lỗi (null)
   - Thang Y tự co giãn theo dữ liệu, giới hạn trong [min, max]
   - xLabels: tối đa 3 nhãn thời gian (đầu / giữa / cuối)
========================================================= */

const CH = { left: 44, right: 14, top: 14, bottom: 8 };

export function SimpleLineChart({
  data,
  unit = '%',
  min = 0,
  max = 100,
  minSpan = 10,
  xLabels = [],
  height = 190,
  emptyText = 'Chưa có dữ liệu',
}) {
  const [width, setWidth] = useState(0);

  const vals = (data || []).map((v) =>
    v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
  );
  const hasData = vals.some((v) => v !== null);

  const plotW = Math.max(0, width - CH.left - CH.right);
  const plotH = height - CH.top - CH.bottom;
  const { lo, hi, ticks } = niceRange(vals, min, max, minSpan);

  const xAt = (i) =>
    CH.left + (vals.length > 1 ? (i / (vals.length - 1)) * plotW : plotW / 2);
  const yAt = (v) =>
    CH.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  // Tách thành các đoạn liên tục (ngắt tại null)
  const segments = [];
  let cur = [];
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push({ x: xAt(i), y: yAt(v) });
    }
  });
  if (cur.length) segments.push(cur);

  const baseY = CH.top + plotH;
  const last = [...vals.keys()].reverse().find((i) => vals[i] !== null);

  return (
    <View
      style={s.chart}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.green} stopOpacity="0.28" />
              <Stop offset="1" stopColor={C.green} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {ticks.map((t) => (
            <React.Fragment key={t}>
              <Line
                x1={CH.left}
                x2={width - CH.right}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="#E7EBE5"
                strokeWidth="1"
              />
              <SvgText
                x={CH.left - 6}
                y={yAt(t) + 3}
                fontSize="9"
                fill={C.gray}
                textAnchor="end"
              >
                {formatTick(t)}{unit}
              </SvgText>
            </React.Fragment>
          ))}

          {segments.map((seg, i) => {
            if (seg.length === 1) {
              return <Circle key={i} cx={seg[0].x} cy={seg[0].y} r="3" fill={C.green} />;
            }
            const line = seg.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            const area = `${line} L${seg[seg.length - 1].x.toFixed(1)} ${baseY} L${seg[0].x.toFixed(1)} ${baseY} Z`;
            return (
              <React.Fragment key={i}>
                <Path d={area} fill="url(#area)" />
                <Path d={line} stroke={C.green} strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </React.Fragment>
            );
          })}

          {hasData && last !== undefined && (
            <>
              <Circle cx={xAt(last)} cy={yAt(vals[last])} r="6" fill={C.green} opacity="0.2" />
              <Circle cx={xAt(last)} cy={yAt(vals[last])} r="3.5" fill={C.green} />
            </>
          )}
        </Svg>
      )}

      {!hasData && (
        <View style={s.chartEmpty}>
          <Text style={s.chartEmptyText}>{emptyText}</Text>
        </View>
      )}

      {xLabels.length > 0 && (
        <View style={s.xLabels}>
          {xLabels.map((l, i) => (
            <Text key={i} style={s.xLabel}>{l}</Text>
          ))}
        </View>
      )}
    </View>
  );
}


/* =========================================================
   STYLES
========================================================= */

const s = StyleSheet.create({

  /* =======================================================
     PAGE TITLE
  ======================================================= */

  title: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },

  h: {
    fontSize: 27,
    fontWeight: '800',
    color: C.darkGreen,
  },

  sub: {
    fontSize: 14,
    color: C.gray,
    marginTop: 3,
  },


  /* =======================================================
     SENSOR CARD
  ======================================================= */

  sensor: {
    flex: 1,
    minHeight: 96,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.white,
    justifyContent: 'space-between',
    gap: 10,
  },

  sensorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  sensorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sensorTitle: {
    flex: 1,
    fontSize: 12.5,
    color: C.gray,
    fontWeight: '600',
  },

  value: {
    fontSize: 22,
    fontWeight: '800',
  },

  overview: {
    paddingHorizontal: 20,
    gap: 12,
  },

  soilCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 16,
  },

  soilTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  soilTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  soilTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B302B',
  },

  soilValue: {
    fontSize: 44,
    fontWeight: '800',
    color: C.blue,
    marginTop: 10,
    marginBottom: 12,
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },

  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },

  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E9EEE7',
    overflow: 'hidden',
  },

  fill: {
    height: 8,
    borderRadius: 4,
  },

  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  half: {
    flex: 0,
    width: '48.5%',
  },


  /* =======================================================
     PLANT CARD
  ======================================================= */

  plant: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  thumb: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: C.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },


  /* =======================================================
     TEXT
  ======================================================= */

  name: {
    fontSize: 15,
    fontWeight: '800',
    color: '#242824',
  },

  type: {
    fontSize: 13,
    color: C.gray,
    lineHeight: 19,
  },

  moisture: {
    fontSize: 16,
    fontWeight: '800',
    color: C.green,
  },


  /* =======================================================
     HISTORY / NOTICE
  ======================================================= */

  item: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },

  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },


  /* =======================================================
     CHART
  ======================================================= */

  chart: {
    borderRadius: 18,
    backgroundColor: C.white,
    overflow: 'hidden',
    paddingBottom: 10,
  },

  chartEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chartEmptyText: {
    color: C.gray,
    fontSize: 13,
  },

  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: CH.left,
    paddingRight: CH.right,
    marginTop: 2,
  },

  xLabel: {
    fontSize: 10,
    color: C.gray,
  },

});
