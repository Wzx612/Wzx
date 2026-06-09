import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import PriceTrendChart from '@/components/charts/PriceTrendChart';
import { DistrictHeatChart, PropertyDistributionChart } from '@/components/charts/DistributionCharts';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useT } from '@/lib/useT';
import type { Bi } from '@/types';

const RANK: { label: Bi; v: number }[] = [
  { label: { en: 'Market Analysis', zh: '市场分析' }, v: 21044 },
  { label: { en: 'Knowledge Base', zh: '知识库' }, v: 19872 },
  { label: { en: 'Property Search', zh: '房源搜索' }, v: 18402 },
  { label: { en: 'Web Search', zh: '联网搜索' }, v: 16201 },
  { label: { en: 'School District', zh: '学区分析' }, v: 15677 },
];

function PanelHead({ title, tag }: { title: Bi; tag: string }) {
  const { b } = useT();
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <div className="row gap-2" style={{ fontSize: 14, fontWeight: 650 }}>
        <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--grad-primary)' }} />
        {b(title)}
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{tag}</span>
    </div>
  );
}

export default function Analytics() {
  const { b, lang } = useT();
  const [clock, setClock] = useState('');
  const [heat, setHeat] = useState<number[]>(() => Array.from({ length: 40 }, () => Math.random()));

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US'));
    tick();
    const c = setInterval(tick, 1000);
    const h = setInterval(() => setHeat(Array.from({ length: 40 }, () => Math.random())), 3000);
    return () => {
      clearInterval(c);
      clearInterval(h);
    };
  }, [lang]);

  const maxRank = RANK[0].v;

  return (
    <AppShell title={{ en: 'Data Visualization', zh: '数据大屏' }} crumb="atlas / intelligence / data-screen" wide>
      <div className="row gap-4" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.03em', fontWeight: 680 }}>
            {lang === 'zh' ? '房产智能数据大屏' : 'Real Estate Intelligence Screen'}
          </h1>
          <div className="row gap-3 mt-2">
            <span className="badge badge-success">
              <span className="badge-dot pulse-dot" />
              {lang === 'zh' ? '实时 · 每 3 秒刷新' : 'LIVE · updating every 3s'}
            </span>
            <span className="text-mono text-sub" style={{ fontSize: 12 }}>{clock}</span>
          </div>
        </div>
        <div className="row gap-4" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { v: 153920, l: { en: 'Agent Runs', zh: '智能体执行' }, c: '#4F7CFF' },
            { v: 8642, l: { en: 'Conversations', zh: '对话量' }, c: '#00D4FF' },
          ].map((k) => (
            <div key={k.l.en} className="card" style={{ padding: '12px 20px', textAlign: 'center' }}>
              <b className="mono" style={{ fontSize: 22, fontWeight: 700, display: 'block', color: k.c }}>
                <AnimatedCounter value={k.v} />
              </b>
              <span style={{ fontSize: 11, color: 'var(--sub)' }}>{b(k.l)}</span>
            </div>
          ))}
          <div className="card" style={{ padding: '12px 20px', textAlign: 'center' }}>
            <b className="mono" style={{ fontSize: 22, fontWeight: 700, display: 'block', color: '#10B981' }}>¥2.84M</b>
            <span style={{ fontSize: 11, color: 'var(--sub)' }}>{lang === 'zh' ? '今日成交' : 'GMV today'}</span>
          </div>
        </div>
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: '1fr 1.3fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <PanelHead title={{ en: 'Agent Usage', zh: '智能体用量' }} tag="24h" />
          <DistrictHeatChart height={220} />
        </div>

        <div className="card" style={{ padding: 18, gridRow: 'span 2' }}>
          <PanelHead title={{ en: 'Market Price Index', zh: '房价指数走势' }} tag="北京 · 12mo" />
          <PriceTrendChart height={300} />
        </div>

        <div className="card" style={{ padding: 18 }}>
          <PanelHead title={{ en: 'Listing Distribution', zh: '房源价格分布' }} tag="bands" />
          <PropertyDistributionChart height={220} />
        </div>

        <div className="card" style={{ padding: 18 }}>
          <PanelHead title={{ en: 'Top Agents', zh: '热门智能体' }} tag="runs" />
          {RANK.map((r, i) => (
            <div key={r.label.en} className="row gap-3" style={{ padding: '8px 0', borderBottom: i < RANK.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, width: 20, color: 'var(--secondary)' }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{b(r.label)}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', maxWidth: 120 }}>
                <div style={{ height: '100%', width: `${(r.v / maxRank) * 100}%`, background: 'var(--grad-primary)', borderRadius: 999 }} />
              </div>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--sub)', width: 44, textAlign: 'right' }}>{(r.v / 1000).toFixed(1)}k</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <PanelHead title={{ en: 'District Heatmap', zh: '区域热度' }} tag="demand" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, marginTop: 6 }}>
            {heat.map((v, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '1',
                  borderRadius: 3,
                  background: `hsl(${(1 - v) * 145}, 70%, 50%)`,
                  opacity: 0.3 + v * 0.6,
                  transition: 'all 0.6s var(--ease)',
                }}
              />
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <PanelHead title={{ en: 'ROI Outlook', zh: '投资回报展望' }} tag="8yr" />
          <PropertyDistributionChart height={220} />
        </div>
      </div>
    </AppShell>
  );
}
