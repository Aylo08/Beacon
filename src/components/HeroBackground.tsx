// Gradient background of the home "now bar", chosen by context: three tones
// plus a soft glow in the top-right corner, and a few stars at night. Drawn with react-native-svg (no extra native module).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export type HeroMode = 'class' | 'lunch' | 'waiting' | 'night' | 'free' | 'loading';

type Gradient = [top: string, middle: string, bottom: string];

/** Gradient (top → bottom) per class type, matching the timetable colours. */
const CLASS_GRADIENTS: Record<string, Gradient> = {
  CM: ['#3b82f6', '#1d4ed8', '#1e3a8a'], // blue
  TD: ['#10b981', '#047857', '#064e3b'], // green
  TP: ['#8b5cf6', '#6d28d9', '#3b0764'], // purple
  Evaluation: ['#f97316', '#c2410c', '#7c2d12'], // orange
};

const GRADIENTS: Record<Exclude<HeroMode, 'class'>, Gradient> = {
  lunch: ['#f43f5e', '#be123c', '#881337'], // rose
  waiting: ['#14b8a6', '#0f766e', '#134e4a'], // teal
  night: ['#4338ca', '#1e1b4b', '#020617'], // indigo → black
  free: ['#fb923c', '#ea580c', '#c2410c'], // sunny orange
  loading: ['#3b82f6', '#1d4ed8', '#1e3a8a'],
};

export function heroColors(mode: HeroMode, classType?: string): Gradient {
  if (mode === 'class') return CLASS_GRADIENTS[classType ?? ''] ?? CLASS_GRADIENTS.CM;
  return GRADIENTS[mode];
}

// Fixed pseudo-random star field (x %, y %, radius, opacity).
const STARS: [number, number, number, number][] = [
  [6, 18, 1.1, 0.9], [14, 52, 0.7, 0.6], [21, 30, 1.3, 0.8], [29, 74, 0.6, 0.5], [35, 12, 0.8, 0.7],
  [41, 44, 1, 0.9], [48, 22, 0.6, 0.5], [55, 64, 1.2, 0.7], [61, 8, 0.7, 0.8], [67, 36, 1, 0.6],
  [73, 58, 0.6, 0.5], [79, 16, 1.4, 0.9], [85, 46, 0.8, 0.7], [91, 26, 0.6, 0.6], [95, 70, 1, 0.8],
  [10, 84, 0.7, 0.4], [44, 88, 0.6, 0.4], [70, 86, 0.8, 0.5], [25, 6, 0.6, 0.6], [58, 40, 0.5, 0.5],
];

export function HeroBackground({ mode, classType }: { mode: HeroMode; classType?: string }) {
  const [top, middle, bottom] = heroColors(mode, classType);
  const id = `hero-${mode}-${classType ?? ''}`;
  // Explicit pixel size: a "100%" Svg isn't always redrawn when the now bar grows (iOS), which left
  // the new content below the gradient. The box is also painted with the bottom colour as a fallback.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: bottom }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
      }}
    >
      {/* Keeps the top colour visible when iOS bounces the scroll view past the top. */}
      <View style={[styles.overscroll, { backgroundColor: top }]} />
      {size && (
        <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="0.55" stopColor={middle} />
              <Stop offset="1" stopColor={bottom} />
            </LinearGradient>
            <RadialGradient id={`${id}-glow`} cx="0.9" cy="0" rx="0.7" ry="0.9" fx="0.9" fy="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={mode === 'night' ? 0.12 : 0.22} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${id})`} />
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${id}-glow)`} />
          {mode === 'night' &&
            STARS.map(([x, y, r, o], i) => <Circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill="#fff" opacity={o} />)}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overscroll: { position: 'absolute', left: 0, right: 0, top: -1000, height: 1000 },
});
