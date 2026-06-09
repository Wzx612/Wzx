import type {
  PricePoint,
  RoiPoint,
  RiskDimension,
  MortgagePlan,
  MortgageBreakdown,
  DistrictHeat,
  Metric,
  FinalReport,
} from '@/types';

/* ---------- 12-month price index (¥k/㎡) ---------- */
const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const haidian = [88, 92, 95, 99, 104, 108, 110, 112, 114, 116, 117, 118];
const chaoyang = [68, 69, 71, 72, 74, 75, 77, 78, 79, 80, 81, 82];
const fengtai = [54, 55, 56, 58, 59, 60, 61, 62, 62, 63, 64, 64];

export const PRICE_TREND: PricePoint[] = MONTHS.map((month, i) => ({
  month,
  haidian: haidian[i],
  chaoyang: chaoyang[i],
  fengtai: fengtai[i],
}));

/* ---------- ROI projection over 8 years ---------- */
export const ROI_TREND: RoiPoint[] = Array.from({ length: 8 }, (_, i) => {
  const year = `Y${i + 1}`;
  const rentalYield = +(2.1 + i * 0.08).toFixed(2);
  const appreciation = +(4.6 + Math.sin(i) * 1.2).toFixed(2);
  const cumulative = +(
    Array.from({ length: i + 1 }).reduce<number>(
      (acc, _v, k) => acc + 2.1 + k * 0.08 + 4.6 + Math.sin(k) * 1.2,
      0,
    )
  ).toFixed(1);
  return { year, rentalYield, appreciation, cumulative };
});

/* ---------- Risk radar ---------- */
export const RISK_RADAR: RiskDimension[] = [
  { dimension: { en: 'Market', zh: '市场风险' }, value: 38 },
  { dimension: { en: 'Liquidity', zh: '流动性' }, value: 24 },
  { dimension: { en: 'Policy', zh: '政策风险' }, value: 52 },
  { dimension: { en: 'Legal', zh: '法律风险' }, value: 18 },
  { dimension: { en: 'Leverage', zh: '杠杆风险' }, value: 44 },
  { dimension: { en: 'Vacancy', zh: '空置风险' }, value: 30 },
];

/* ---------- Mortgage plans by bank ---------- */
export const MORTGAGE_PLANS: MortgagePlan[] = [
  { bank: { en: 'ICBC 工商银行', zh: '工商银行' }, rate: 3.95, downRatio: 0.3, monthly: 31204, recommended: true },
  { bank: { en: 'CCB 建设银行', zh: '建设银行' }, rate: 4.0, downRatio: 0.3, monthly: 31510, recommended: false },
  { bank: { en: 'ABC 农业银行', zh: '农业银行' }, rate: 4.05, downRatio: 0.35, monthly: 29380, recommended: false },
  { bank: { en: 'BOC 中国银行', zh: '中国银行' }, rate: 3.9, downRatio: 0.4, monthly: 27120, recommended: false },
];

export const MORTGAGE_BREAKDOWN: MortgageBreakdown = {
  price: 9440000,
  downPayment: 2832000,
  loanAmount: 6608000,
  rate: 3.95,
  termYears: 30,
  monthlyPayment: 31204,
  totalInterest: 4625440,
};

/* ---------- District heat (for bar / heatmap) ---------- */
export const DISTRICT_HEAT: DistrictHeat[] = [
  { district: { en: 'Haidian', zh: '海淀' }, demand: 92, supply: 64, growth: 6.2 },
  { district: { en: 'Xicheng', zh: '西城' }, demand: 88, supply: 41, growth: 4.1 },
  { district: { en: 'Chaoyang', zh: '朝阳' }, demand: 85, supply: 78, growth: 7.8 },
  { district: { en: 'Dongcheng', zh: '东城' }, demand: 80, supply: 46, growth: 4.6 },
  { district: { en: 'Fengtai', zh: '丰台' }, demand: 74, supply: 82, growth: 8.4 },
  { district: { en: 'Tongzhou', zh: '通州' }, demand: 68, supply: 90, growth: 9.6 },
];

/* ---------- Dashboard metrics ---------- */
export const METRICS: Metric[] = [
  { icon: 'users', label: { en: 'Total Users', zh: '总用户数' }, value: 48294, delta: '+12.4%', up: true, color: '#4F7CFF', seed: 3 },
  { icon: 'bot', label: { en: 'Active Agents', zh: '活跃智能体' }, value: 12, delta: '+2', up: true, color: '#7C3AED', seed: 4 },
  { icon: 'msg', label: { en: 'Daily Analyses', zh: '今日分析量' }, value: 8642, delta: '+23.8%', up: true, color: '#00D4FF', seed: 5 },
  { icon: 'home', label: { en: 'Recommended Listings', zh: '推荐房源' }, value: 1284, delta: '+96', up: true, color: '#10B981', seed: 6 },
  { icon: 'invest', label: { en: 'Avg ROI', zh: 'ROI 平均值' }, value: 7.4, decimals: 1, suffix: '%', delta: '+0.6', up: true, color: '#F59E0B', seed: 7 },
  { icon: 'shield', label: { en: 'Risk Score', zh: '风险评分' }, value: 34, suffix: '/100', delta: '-3', up: false, color: '#F43F5E', seed: 8 },
];

/* ---------- Coordinator final report ---------- */
export const FINAL_REPORT: FinalReport = {
  overallScore: 84,
  recommendation: 'buy',
  investmentAdvice: {
    en: 'Haidian Zhongguancun offers a strong school-district premium with above-average rental demand. Entry now captures appreciation before the next policy cycle, though leverage should stay under 65%.',
    zh: '海淀中关村具备显著的学区溢价与高于平均的租赁需求。当前入手可在下一轮政策周期前锁定升值空间，但杠杆建议控制在 65% 以内。',
  },
  risks: [
    { en: 'Unit price already above the ¥80k/㎡ budget ceiling.', zh: '单价已超过 8 万/㎡ 的预算上限。' },
    { en: 'School-policy reform could reprice catchment premiums.', zh: '学区政策改革可能重新定价划片溢价。' },
    { en: 'Liquidity tightens for units above ¥9M in a down cycle.', zh: '下行周期中 900 万以上房源流动性收紧。' },
  ],
  mortgageAdvice: {
    en: 'ICBC at 3.95% LPR with 30% down minimises monthly burden (¥31,204). Consider a 25-year term to cut total interest by ~¥0.9M.',
    zh: '工商银行 3.95% LPR、三成首付月供最低（¥31,204）。可考虑 25 年期，节省约 90 万总利息。',
  },
  subScores: [
    { label: { en: 'Search Match', zh: '房源匹配' }, value: 88, color: '#4F7CFF' },
    { label: { en: 'Market Outlook', zh: '市场前景' }, value: 82, color: '#00D4FF' },
    { label: { en: 'Investment ROI', zh: '投资回报' }, value: 79, color: '#7C3AED' },
    { label: { en: 'Mortgage Fit', zh: '贷款适配' }, value: 86, color: '#10B981' },
    { label: { en: 'Risk Control', zh: '风险控制' }, value: 71, color: '#F43F5E' },
  ],
};

/* ---------- Property distribution by price band (pie) ---------- */
export const PRICE_DISTRIBUTION = [
  { band: { en: '< ¥3M', zh: '300万以下' }, count: 3, color: '#10B981' },
  { band: { en: '¥3M – ¥6M', zh: '300–600万' }, count: 7, color: '#00D4FF' },
  { band: { en: '¥6M – ¥10M', zh: '600–1000万' }, count: 6, color: '#4F7CFF' },
  { band: { en: '> ¥10M', zh: '1000万以上' }, count: 4, color: '#7C3AED' },
];
