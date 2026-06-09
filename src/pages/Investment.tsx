import AppShell from '@/components/layout/AppShell';
import { PageHead, SectionHead } from '@/components/ui/Headings';
import RoiChart from '@/components/charts/RoiChart';
import RiskRadar from '@/components/charts/RiskRadar';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useT } from '@/lib/useT';
import { ROI_TREND, RISK_RADAR } from '@/mock/analytics';
import type { Bi } from '@/types';

export default function Investment() {
  const { b, lang } = useT();
  const cumulative = ROI_TREND[ROI_TREND.length - 1].cumulative;
  const avgRisk = Math.round(RISK_RADAR.reduce((a, r) => a + r.value, 0) / RISK_RADAR.length);

  const stats: { label: Bi; value: number; suffix?: string; color: string }[] = [
    { label: { en: '8-yr Cumulative', zh: '8 年累计回报' }, value: cumulative, suffix: '%', color: '#10B981' },
    { label: { en: 'Avg Rental Yield', zh: '平均租金回报' }, value: 2.6, suffix: '%', color: '#00D4FF' },
    { label: { en: 'ROI Score', zh: '投资评分' }, value: 79, suffix: '/100', color: '#7C3AED' },
    { label: { en: 'Risk Index', zh: '风险指数' }, value: avgRisk, suffix: '/100', color: '#F43F5E' },
  ];

  return (
    <AppShell title={{ en: 'Investment Analysis', zh: '投资分析' }} crumb="atlas / intelligence / investment">
      <PageHead
        title={{ en: 'Investment Analysis', zh: '投资分析' }}
        desc={{
          en: 'Investment Agent models rental yield, appreciation, cumulative ROI, and multi-dimensional risk.',
          zh: '投资顾问智能体建模租金回报、升值空间、累计 ROI 与多维风险。',
        }}
      />

      <div className="grid-base grid-4" style={{ marginBottom: 32 }}>
        {stats.map((s) => (
          <div key={s.label.en} className="card card-hover" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>{b(s.label)}</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: s.color, marginTop: 8, lineHeight: 1 }}>
              <AnimatedCounter value={s.value} decimals={s.value % 1 !== 0 ? 1 : 0} suffix={s.suffix} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid-base grid-2">
        <div className="card" style={{ padding: 20 }}>
          <SectionHead
            title={{ en: 'ROI Projection', zh: 'ROI 回报预测' }}
            sub={{ en: 'Rental yield + appreciation + cumulative', zh: '租金回报 + 升值 + 累计' }}
          />
          <RoiChart height={300} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <SectionHead
            title={{ en: 'Risk Radar', zh: '风险雷达' }}
            sub={{ en: 'Lower is safer · 6 dimensions', zh: '数值越低越安全 · 六维度' }}
          />
          <RiskRadar height={300} />
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 24 }}>
        <SectionHead title={{ en: 'Risk Dimensions', zh: '风险维度明细' }} />
        <div className="grid-base grid-3">
          {RISK_RADAR.map((r) => (
            <div key={r.dimension.en}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span>{b(r.dimension)}</span>
                <b className="mono" style={{ color: r.value > 45 ? '#F59E0B' : 'var(--sub)' }}>{r.value}</b>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${r.value}%`,
                    borderRadius: 999,
                    background: r.value > 45 ? '#F59E0B' : '#10B981',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
          {lang === 'zh' ? '投资顾问智能体 · invest.roi' : 'Investment Advisor Agent · invest.roi'}
        </div>
      </div>
    </AppShell>
  );
}
