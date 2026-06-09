import type { Lang } from '@/types';

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Format a number with locale grouping. */
export function fmtNum(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a CNY amount, collapsing to 万 / 亿 where helpful. */
export function fmtCny(value: number, lang: Lang): string {
  if (lang === 'zh') {
    if (value >= 1e8) return `¥${(value / 1e8).toFixed(2)}亿`;
    if (value >= 1e4) return `¥${(value / 1e4).toFixed(value >= 1e6 ? 0 : 1)}万`;
    return `¥${fmtNum(value)}`;
  }
  if (value >= 1e6) return `¥${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `¥${(value / 1e3).toFixed(0)}k`;
  return `¥${fmtNum(value)}`;
}

/** Unit price per square metre, expressed in 万/㎡ or ¥k/㎡. */
export function fmtUnitPrice(value: number, lang: Lang): string {
  return lang === 'zh'
    ? `¥${(value / 1e4).toFixed(1)}万/㎡`
    : `¥${(value / 1e3).toFixed(1)}k/㎡`;
}

/** Sleep helper for scripted async demos. */
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Clamp a number into a range. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Deterministic pseudo-random generator so mock data is stable across renders. */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
