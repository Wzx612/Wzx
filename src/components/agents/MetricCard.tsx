import { motion } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Sparkline from '@/components/ui/Sparkline';
import type { Metric } from '@/types';

export default function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const { b } = useT();
  const Icon = getIcon(metric.icon);
  const Arrow = getIcon(metric.up ? 'arrowUp' : 'arrowDown');

  return (
    <motion.div
      className="card card-hover"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--sub)', fontWeight: 500 }}>{b(metric.label)}</div>
          <div
            className="mono"
            style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 8 }}
          >
            <AnimatedCounter
              value={metric.value}
              decimals={metric.decimals ?? 0}
              prefix={metric.prefix ?? ''}
              suffix={metric.suffix ?? ''}
            />
          </div>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface-3)',
            color: metric.color,
            boxShadow: `0 6px 16px ${metric.color}33`,
          }}
        >
          <Icon size={20} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Sparkline color={metric.color} seed={metric.seed} />
        </div>
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: metric.up ? 'var(--success)' : 'var(--danger)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Arrow size={13} />
          {metric.delta}
        </span>
      </div>
    </motion.div>
  );
}
