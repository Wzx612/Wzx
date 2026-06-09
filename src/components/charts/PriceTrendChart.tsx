import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PRICE_TREND } from '@/mock/analytics';
import { useT } from '@/lib/useT';

const SERIES = [
  { key: 'haidian' as const, color: '#4F7CFF', label: { en: 'Haidian', zh: '海淀' } },
  { key: 'chaoyang' as const, color: '#00D4FF', label: { en: 'Chaoyang', zh: '朝阳' } },
  { key: 'fengtai' as const, color: '#10B981', label: { en: 'Fengtai', zh: '丰台' } },
];

export default function PriceTrendChart({ height = 300 }: { height?: number }) {
  const { b } = useT();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={PRICE_TREND} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ stroke: 'var(--glass-border-strong)' }} />
        <Legend
          formatter={(value) => {
            const s = SERIES.find((x) => x.key === value);
            return s ? b(s.label) : value;
          }}
          wrapperStyle={{ fontSize: 12, color: 'var(--sub)' }}
        />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2.4}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
