import { useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead, SectionHead } from '@/components/ui/Headings';
import { useT } from '@/lib/useT';
import { fmtCny } from '@/lib/format';
import { MORTGAGE_PLANS } from '@/mock/analytics';
import { getIcon } from '@/lib/icons';

/** Standard annuity (equal-payment) monthly amount. */
function annuity(loan: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function Mortgage() {
  const { b, lang } = useT();
  const [price, setPrice] = useState(9440000);
  const [downRatio, setDownRatio] = useState(0.3);
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState(3.95);
  const Bank = getIcon('bank');

  const calc = useMemo(() => {
    const down = price * downRatio;
    const loan = price - down;
    const monthly = annuity(loan, rate, years);
    const totalPay = monthly * years * 12;
    const totalInterest = totalPay - loan;
    return { down, loan, monthly, totalInterest, totalPay };
  }, [price, downRatio, years, rate]);

  const fields: { label: string; value: number; color?: string }[] = [
    { label: lang === 'zh' ? '首付金额' : 'Down Payment', value: calc.down, color: '#4F7CFF' },
    { label: lang === 'zh' ? '贷款金额' : 'Loan Amount', value: calc.loan, color: '#00D4FF' },
    { label: lang === 'zh' ? '总利息' : 'Total Interest', value: calc.totalInterest, color: '#F59E0B' },
  ];

  return (
    <AppShell title={{ en: 'Mortgage Analysis', zh: '房贷分析' }} crumb="atlas / intelligence / mortgage">
      <PageHead
        title={{ en: 'Mortgage Analysis', zh: '房贷分析' }}
        desc={{
          en: 'Mortgage Agent computes monthly payment, down-payment, and recommends the best bank plan at current LPR.',
          zh: '房贷顾问智能体测算月供、首付，并按当前 LPR 推荐最优银行方案。',
        }}
      />

      <div className="grid-base" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* calculator */}
        <div className="card" style={{ padding: 24 }}>
          <SectionHead title={{ en: 'Affordability Calculator', zh: '月供测算器' }} />

          <Slider
            label={lang === 'zh' ? '房屋总价' : 'Property Price'}
            value={fmtCny(price, lang)}
            min={1000000}
            max={20000000}
            step={100000}
            raw={price}
            onChange={setPrice}
          />
          <Slider
            label={lang === 'zh' ? '首付比例' : 'Down-payment Ratio'}
            value={`${Math.round(downRatio * 100)}%`}
            min={20}
            max={80}
            step={5}
            raw={downRatio * 100}
            onChange={(v) => setDownRatio(v / 100)}
          />
          <Slider
            label={lang === 'zh' ? '贷款年限' : 'Loan Term'}
            value={`${years} ${lang === 'zh' ? '年' : 'yr'}`}
            min={5}
            max={30}
            step={1}
            raw={years}
            onChange={setYears}
          />
          <Slider
            label={lang === 'zh' ? '年利率 (LPR)' : 'Annual Rate (LPR)'}
            value={`${rate.toFixed(2)}%`}
            min={3}
            max={6}
            step={0.05}
            raw={rate}
            onChange={(v) => setRate(+v.toFixed(2))}
          />

          <div
            style={{
              marginTop: 8,
              padding: 22,
              borderRadius: 'var(--r)',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              textAlign: 'center',
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {lang === 'zh' ? '预估月供' : 'Estimated Monthly'}
            </div>
            <div className="mono" style={{ fontSize: 38, fontWeight: 700, color: '#10B981', lineHeight: 1 }}>
              ¥{Math.round(calc.monthly).toLocaleString()}
            </div>
          </div>

          <div className="grid-base grid-3" style={{ marginTop: 16 }}>
            {fields.map((f) => (
              <div key={f.label}>
                <div style={{ fontSize: 11.5, color: 'var(--sub)' }}>{f.label}</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: f.color, marginTop: 3 }}>
                  {fmtCny(f.value, lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bank plans */}
        <div>
          <SectionHead
            title={{ en: 'Bank Plan Recommendations', zh: '银行方案推荐' }}
            sub={{ en: 'Ranked by monthly burden at your inputs', zh: '按当前条件下月供排序' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MORTGAGE_PLANS.map((plan) => (
              <div
                key={plan.bank.en}
                className="card card-hover"
                style={{
                  padding: 18,
                  border: plan.recommended ? '1px solid rgba(16,185,129,0.4)' : '1px solid var(--glass-border)',
                  boxShadow: plan.recommended ? '0 0 0 2px rgba(16,185,129,0.2)' : undefined,
                }}
              >
                <div className="row gap-3" style={{ justifyContent: 'space-between' }}>
                  <div className="row gap-3">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 11,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--grad-primary)',
                      }}
                    >
                      <Bank color="#fff" size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>{b(plan.bank)}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        LPR {plan.rate}% · {Math.round(plan.downRatio * 100)}%{' '}
                        {lang === 'zh' ? '首付' : 'down'}
                      </div>
                    </div>
                  </div>
                  {plan.recommended && (
                    <span className="badge badge-success">{lang === 'zh' ? '推荐' : 'Best'}</span>
                  )}
                </div>
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}
                >
                  <span style={{ fontSize: 12, color: 'var(--sub)' }}>
                    {lang === 'zh' ? '参考月供' : 'Ref. monthly'}
                  </span>
                  <span className="mono" style={{ fontSize: 17, fontWeight: 700 }}>
                    ¥{plan.monthly.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  raw,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  raw: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--sub)', fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--secondary)', fontWeight: 600 }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
    </div>
  );
}
