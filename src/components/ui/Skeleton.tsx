import type { CSSProperties } from 'react';
import { cn } from '@/lib/format';

interface Props {
  className?: string;
  rounded?: string;
  style?: CSSProperties;
}

/** Shimmering skeleton placeholder used during progressive loading. */
export default function Skeleton({ className, rounded = '10px', style }: Props) {
  return (
    <div
      className={cn('atlas-skeleton', className)}
      style={{ borderRadius: rounded, ...style }}
      aria-hidden
    />
  );
}
