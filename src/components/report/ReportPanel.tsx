import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import type { FinalReport, Recommendation, Bi } from '@/types';

const REC_META: Record<Recommendation, { label: Bi; color: string }> = {
  'strong-buy': { label: { en: 'Strong Buy', zh: '强烈推荐' }, color: '#10B981' },
  buy: { label: { en: 'Buy', zh: '推荐买入' }, color: '#10B981' },
  hold: { label: { en: 'Hold', zh: '建议持有' }, color: '#F59E0B' },
  caution: { label: { en: 'Caution', zh: '谨慎' }, color: '#F59E0B' },
  avoid: { label: { en: 'Avoid', zh: '不建议' }, color: '#F43F5E' },
};

export default function ReportPanel({ report }: { report: FinalReport }) {
  const { b, lang } = useT();
  const rec = REC_META[report.recommendation];
  const Sparkle = getIcon('sparkle');
  const Invest = getIcon('invest');
  const Warn = getIcon('warn');
  const Bank = getIcon('bank');

  const scoreColor =
    report.overallScore >= 80 ? '#10B981' : report.overallScore >= 60 ? '#F59E0B' : '#F43F5E';

  return (
    <motion.div
      className="card"
      style={{ padding: 28, overflow: 'hidden' }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* header */}
      <div className="row gap-3" style={{ marginBottom: 22 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--grad-iris)',
            boxShadow: '0 8px 22px rgba(124,58,237,0.4)',
          }}
        >
          <Sparkle color="#fff" size={22} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 680 }}>
            {lang === 'zh' ? '协调智能体 · 综合报告' : 'Coordinator · Final Report'}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            coordinator.synthesis · {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
      </div>

      {/* score + recommendation */}
      <div
        className="grid-base grid-2"
        style={{ marginBottom: 24 }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 'var(--r)',
            background: 'var(--surface-1)',
            border: '1px solid var(--glass-border)',
            textAlign: 'center',
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {lang === 'zh' ? '综合评分' : 'Overall Score'}
          </div>
          <div className="mono" style={{ fontSize: 46, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
            <AnimatedCounter value={report.overallScore} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>/ 100</div>
        </div>
        <div
          style={{
            padding: 20,
            borderRadius: 'var(--r)',
            background: `${rec.color}14`,
            border: `1px solid ${rec.color}44`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div className="eyebrow">{lang === 'zh' ? '推荐等级' : 'Recommendation'}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: rec.color }}>{b(rec.label)}</div>
        </div>
      </div>

      {/* sub-scores */}
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {lang === 'zh' ? '智能体分项评分' : 'Agent Sub-scores'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 24 }}>
        {report.subScores.map((s) => (
          <div key={s.label.en}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
              <span>{b(s.label)}</span>
              <b className="mono">{s.value}</b>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                style={{ height: '100%', borderRadius: 999, background: s.color }}
                initial={{ width: 0 }}
                animate={{ width: `${s.value}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* investment advice */}
      <Section icon={<Invest size={15} />} color="#7C3AED" title={lang === 'zh' ? '投资建议' : 'Investment Advice'}>
        {b(report.investmentAdvice)}
      </Section>

      {/* mortgage advice */}
      <Section icon={<Bank size={15} />} color="#10B981" title={lang === 'zh' ? '贷款建议' : 'Mortgage Advice'}>
        {b(report.mortgageAdvice)}
      </Section>

      {/* risks */}
      <div
        style={{
          padding: 16,
          borderRadius: 'var(--r)',
          background: 'rgba(244,63,94,0.08)',
          border: '1px solid rgba(244,63,94,0.25)',
        }}
      >
        <div className="row gap-2" style={{ fontWeight: 650, color: '#F43F5E', marginBottom: 8, fontSize: 13 }}>
          <Warn size={15} />
          {lang === 'zh' ? '风险提示' : 'Risk Notices'}
        </div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {report.risks.map((r, i) => (
            <li key={i} style={{ fontSize: 12.5, color: 'var(--sub)', paddingLeft: 16, position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 2,
                  top: 7,
                  width: 5,
                  height: 5,
                  borderRadius: 2,
                  background: '#F43F5E',
                }}
              />
              {b(r)}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function Section({
  icon,
  color,
  title,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row gap-2" style={{ fontWeight: 650, color, marginBottom: 7, fontSize: 13 }}>
        {icon}
        {title}
      </div>
      <p style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
