import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { DISTRICT_HEAT, PRICE_DISTRIBUTION } from '@/mock/analytics';
import { useT } from '@/lib/useT';

const HEAT_COLORS = ['#00D4FF', '#10B981', '#4F7CFF', '#7C3AED', '#F59E0B', '#F43F5E'];

export function DistrictHeatChart({ height = 240 }: { height?: number }) {
  const { b } = useT();
  const demand = b({ en: 'Demand', zh: '需求热度' });
  const data = DISTRICT_HEAT.map((d) => ({ name: b(d.district), [demand]: d.demand }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        <Tooltip cursor={{ fill: 'var(--surface-1)' }} />
        <Bar dataKey={demand} radius={[4, 4, 0, 0]} barSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={HEAT_COLORS[i % HEAT_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PropertyDistributionChart({ height = 240 }: { height?: number }) {
  const { b } = useT();
  const data = PRICE_DISTRIBUTION.map((d) => ({
    name: b(d.band),
    value: d.count,
    color: d.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={78}
          paddingAngle={3}
          stroke="none"
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
