import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { fmtNum } from '@/lib/format';

interface Props {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

/** Eases from 0 to `value`; always settles on the exact target. */
export default function AnimatedCounter({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1.1,
  className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {fmtNum(display, decimals)}
      {suffix}
    </span>
  );
}
