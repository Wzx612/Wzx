import { useMemo } from 'react';
import { seededRandom, clamp } from '@/lib/format';

interface Props {
  color: string;
  seed: number;
  width?: number;
  height?: number;
}

/** Deterministic mini area-line sparkline. */
export default function Sparkline({ color, seed, width = 200, height = 34 }: Props) {
  const { line, area, id } = useMemo(() => {
    const rand = seededRandom(seed + 17);
    const pts: number[] = [];
    let v = 40 + (seed % 10);
    for (let i = 0; i < 22; i++) {
      v += Math.sin(i * 0.7 + seed) * 6 + (rand() * 8 - 3);
      v = clamp(v, 8, 56);
      pts.push(v);
    }
    const linePts = pts
      .map((p, i) => `${(i / (pts.length - 1)) * width},${height - (p / 64) * height}`)
      .join(' ');
    return {
      line: linePts,
      area: `0,${height} ${linePts} ${width},${height}`,
      id: `spark-${seed}`,
    };
  }, [seed, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={area} fill={`url(#${id})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
