import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { clamp01, positionToValue, stepVolume } from '@/lib/volume';

type Props = {
  value: number; // 0..1
  onChange: (v: number) => void;
  /** Parmak/fare bırakılınca veya +/- düğmesine basılınca (örnek ses çalmak için) */
  onChangeEnd?: (v: number) => void;
  disabled?: boolean;
};

const THUMB = 24;
const TRACK_H = 6;
const HIT_H = 40;

/**
 * Sürüklenebilir ses çubuğu + (−) (+) düğmeleri.
 * Çubuk sürüklemesi çalışmazsa düğmeler yedek olarak %10'luk adımlarla ayarlar.
 */
export default function VolumeSlider({ value, onChange, onChangeEnd, disabled = false }: Props) {
  const [width, setWidth] = useState(0);

  // PanResponder bir kez oluşur; güncel değerlere ref üzerinden ulaşır.
  const latest = useRef({ width: 0, onChange, onChangeEnd, disabled, startX: 0, current: value });
  useEffect(() => {
    latest.current.onChange = onChange;
    latest.current.onChangeEnd = onChangeEnd;
    latest.current.disabled = disabled;
    latest.current.width = width;
  });

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const l = latest.current;
        l.startX = e.nativeEvent.locationX;
        l.current = positionToValue(l.startX, l.width);
        l.onChange(l.current);
      },
      onPanResponderMove: (_e, gs) => {
        const l = latest.current;
        l.current = positionToValue(l.startX + gs.dx, l.width);
        l.onChange(l.current);
      },
      onPanResponderRelease: () => {
        const l = latest.current;
        l.onChangeEnd?.(l.current);
      },
    }),
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const v = clamp01(value);
  const step = (delta: number) => {
    if (disabled) return;
    const next = stepVolume(v, delta);
    onChange(next);
    onChangeEnd?.(next);
  };

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Pressable style={styles.stepBtn} onPress={() => step(-0.1)} hitSlop={6} accessibilityLabel="Sesi kıs">
        <Text style={styles.stepText}>−</Text>
      </Pressable>

      <View
        style={styles.hit}
        onLayout={onLayout}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${v * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: Math.max(0, Math.min(width - THUMB, v * width - THUMB / 2)) }]}
        />
      </View>

      <Pressable style={styles.stepBtn} onPress={() => step(0.1)} hitSlop={6} accessibilityLabel="Sesi yükselt">
        <Text style={styles.stepText}>+</Text>
      </Pressable>

      <Text style={styles.percent}>{Math.round(v * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  disabled: { opacity: 0.4 },
  hit: { flex: 1, height: HIT_H, justifyContent: 'center' },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: '#3a3a3a', overflow: 'hidden' },
  fill: { height: TRACK_H, backgroundColor: '#2563eb' },
  thumb: {
    position: 'absolute',
    top: (HIT_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '600' },
  percent: { color: '#bbb', fontSize: 13, width: 42, textAlign: 'right' },
});
