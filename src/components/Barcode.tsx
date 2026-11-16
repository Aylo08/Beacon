// Code 128 barcode drawn with react-native-svg, stretched to the given box.
import { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
import { code128 } from '../lib/code128';

export function Barcode({ value, width, height, color = '#000' }: { value: string; width: number; height: number; color?: string }) {
  const { bars, total } = useMemo(() => {
    const widths = code128(value);
    const out: { x: number; w: number }[] = [];
    let x = 0;
    widths.forEach((w, i) => {
      if (i % 2 === 0) out.push({ x, w });
      x += w;
    });
    return { bars: out, total: x };
  }, [value]);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${total} 1`} preserveAspectRatio="none">
      {bars.map((b) => (
        <Rect key={b.x} x={b.x} y={0} width={b.w} height={1} fill={color} />
      ))}
    </Svg>
  );
}
