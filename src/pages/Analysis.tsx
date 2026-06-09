import AppShell from '@/components/layout/AppShell';
import { PageHead, SectionHead } from '@/components/ui/Headings';
import PriceTrendChart from '@/components/charts/PriceTrendChart';
import { DistrictHeatChart, PropertyDistributionChart } from '@/components/charts/DistributionCharts';
import { useT } from '@/lib/useT';
import { DISTRICT_HEAT } from '@/mock/analytics';

export default function Analysis() {
  const { b, lang } = useT();
  return (
    <AppShell title={{ en: 'Market Analysis', zh: '市场分析' }} crumb="atlas / workspace / analysis">
      <PageHead
        title={{ en: 'Market Analysis', zh: '市场分析' }}
        desc={{
          en: 'Market Agent tracks district price trends, transaction velocity, and demand heat across Beijing.',
          zh: '市场智能体追踪北京各区房价走势、成交速度与需求热度。',
        }}
      />

      <SectionHead
        title={{ en: 'Price Index Trend', zh: '房价指数走势' }}
        sub={{ en: 'Beijing · trailing 12 months · ¥k/㎡', zh: '北京 · 近 12 个月 · ¥千/㎡' }}
        actions={<span className="badge badge-primary mono">市场 · 12mo</span>}
      />
      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
        <PriceTrendChart height={320} />
      </div>

      <div className="grid-base grid-2" style={{ marginBottom: 32 }}>
        <div className="card" style={{ padding: 20 }}>
          <SectionHead title={{ en: 'District Demand Heat', zh: '区域需求热度' }} />
          <DistrictHeatChart height={260} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <SectionHead title={{ en: 'Listing Distribution', zh: '房源价格分布' }} />
          <PropertyDistributionChart height={260} />
        </div>
      </div>

      <SectionHead title={{ en: 'District Breakdown', zh: '区域明细' }} />
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                { en: 'District', zh: '区域' },
                { en: 'Demand', zh: '需求' },
                { en: 'Supply', zh: '供应' },
                { en: 'YoY Growth', zh: '同比涨幅' },
              ].map((h) => (
                <th
                  key={h.en}
                  className="mono"
                  style={{
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  {b(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISTRICT_HEAT.map((d) => (
              <tr key={d.district.en}>
                <td style={{ padding: '13px 16px', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>
                  {b(d.district)}
                </td>
                <td style={{ padding: '13px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                  <Bar value={d.demand} color="#00D4FF" />
                </td>
                <td style={{ padding: '13px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                  <Bar value={d.supply} color="#7C3AED" />
                </td>
                <td
                  className="mono"
                  style={{ padding: '13px 16px', borderBottom: '1px solid var(--glass-border)', color: 'var(--success)', fontWeight: 600 }}
                >
                  +{d.growth}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ height: 8 }} />
      <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
        {lang === 'zh' ? '数据来源：链家成交价指数 · 市场智能体' : 'Source: Lianjia price index · Market Agent'}
      </span>
    </AppShell>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="row gap-2">
      <div style={{ flex: 1, maxWidth: 120, height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 999 }} />
      </div>
      <span className="mono" style={{ fontSize: 12, color: 'var(--sub)' }}>{value}</span>
    </div>
  );
}
