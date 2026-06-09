import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { RISK_RADAR } from '@/mock/analytics';
import { useT } from '@/lib/useT';

export default function RiskRadar({ height = 300 }: { height?: number }) {
  const { b } = useT();
  const label = b({ en: 'Risk', zh: '风险值' });
  const data = RISK_RADAR.map((d) => ({ dimension: b(d.dimension), [label]: d.value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid />
        <PolarAngleAxis dataKey="dimension" />
        <PolarRadiusAxis angle={90} domain={[0, 60]} tick={false} axisLine={false} />
        <Tooltip />
        <Radar
          name={label}
          dataKey={label}
          stroke="#F43F5E"
          fill="#F43F5E"
          fillOpacity={0.3}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
