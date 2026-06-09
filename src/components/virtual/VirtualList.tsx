import { useRef, useState, useCallback, type ReactNode, type UIEvent } from 'react';

interface VirtualListProps<T> {
  items: T[];
  /** fixed row height in px */
  rowHeight: number;
  /** viewport height in px */
  height: number;
  /** extra rows rendered above/below the viewport */
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
}

/**
 * Fixed-height virtual scroller. Renders only the rows intersecting the
 * viewport (plus overscan), so a list of tens of thousands stays at 60fps.
 */
export default function VirtualList<T>({
  items,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  className,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(top));
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(height / rowHeight) + overscan * 2;
  const endIndex = Math.min(total, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;

  const rows: ReactNode[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    rows.push(
      <div key={i} style={{ height: rowHeight }}>
        {renderRow(items[i], i)}
      </div>,
    );
  }

  return (
    <div
      className={className}
      onScroll={onScroll}
      style={{ height, overflowY: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>{rows}</div>
      </div>
    </div>
  );
}
