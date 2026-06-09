import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ROI_TREND } from '@/mock/analytics';
import { useT } from '@/lib/useT';

export default function RoiChart({ height = 300 }: { height?: number }) {
  const { b } = useT();
  const labels = {
    rentalYield: b({ en: 'Rental Yield %', zh: '租金回报 %' }),
    appreciation: b({ en: 'Appreciation %', zh: '升值 %' }),
    cumulative: b({ en: 'Cumulative %', zh: '累计回报 %' }),
  };
  const data = ROI_TREND.map((d) => ({
    year: d.year,
    [labels.rentalYield]: d.rentalYield,
    [labels.appreciation]: d.appreciation,
    [labels.cumulative]: d.cumulative,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="roi-cum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: 'var(--surface-1)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={labels.rentalYield} barSize={14} fill="#10B981" radius={[3, 3, 0, 0]} />
        <Bar dataKey={labels.appreciation} barSize={14} fill="#00D4FF" radius={[3, 3, 0, 0]} />
        <Area
          type="monotone"
          dataKey={labels.cumulative}
          stroke="#7C3AED"
          strokeWidth={2.4}
          fill="url(#roi-cum)"
        />
        <Line type="monotone" dataKey={labels.cumulative} stroke="#7C3AED" strokeWidth={0} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
