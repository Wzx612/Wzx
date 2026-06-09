import type { AgentDef } from '@/types';

/* ============================================================
   Agent registry.
   The dashboard surfaces 10 specialised agents; the core
   advisory pipeline (Search → Market → Investment → Mortgage →
   Coordinator) is a curated subset used by the workflow runner.
   ============================================================ */

export const AGENTS: AgentDef[] = [
  {
    id: 'search',
    icon: 'home',
    name: { en: 'Property Search', zh: '房源搜索' },
    tag: 'search.estate',
    desc: {
      en: 'Finds listings matching budget, district, and lifestyle filters.',
      zh: '按预算、区域与生活方式筛选匹配房源。',
    },
    usage: 18402,
    health: '#10B981',
    color: '#4F7CFF',
  },
  {
    id: 'mortgage',
    icon: 'bank',
    name: { en: 'Mortgage Advisor', zh: '房贷顾问' },
    tag: 'finance.loan',
    desc: {
      en: 'Computes LPR rates, down-payment, and monthly affordability.',
      zh: '测算 LPR 利率、首付与月供承受力。',
    },
    usage: 12903,
    health: '#10B981',
    color: '#10B981',
  },
  {
    id: 'school',
    icon: 'school',
    name: { en: 'School District', zh: '学区分析' },
    tag: 'edu.district',
    desc: {
      en: 'Maps catchment zones and ranks 学区 quality by enrollment data.',
      zh: '解析学区划片，按招生数据评估学区质量。',
    },
    usage: 15677,
    health: '#10B981',
    color: '#F59E0B',
  },
  {
    id: 'market',
    icon: 'trend',
    name: { en: 'Market Analysis', zh: '市场分析' },
    tag: 'market.trend',
    desc: {
      en: 'Tracks price trends, inventory, and transaction velocity.',
      zh: '追踪价格走势、库存与成交速度。',
    },
    usage: 21044,
    health: '#10B981',
    color: '#00D4FF',
  },
  {
    id: 'legal',
    icon: 'gavel',
    name: { en: 'Legal Risk', zh: '法律风险' },
    tag: 'legal.risk',
    desc: {
      en: 'Flags title, contract, and ownership risks before purchase.',
      zh: '购房前识别产权、合同与权属风险。',
    },
    usage: 8120,
    health: '#F59E0B',
    color: '#F43F5E',
  },
  {
    id: 'investment',
    icon: 'invest',
    name: { en: 'Investment Advisor', zh: '投资顾问' },
    tag: 'invest.roi',
    desc: {
      en: 'Models rental yield, appreciation, and exit scenarios.',
      zh: '建模租金回报、升值空间与退出情景。',
    },
    usage: 13988,
    health: '#10B981',
    color: '#7C3AED',
  },
  {
    id: 'transport',
    icon: 'train',
    name: { en: 'Transportation', zh: '交通分析' },
    tag: 'transit.access',
    desc: {
      en: 'Scores commute time, metro access, and future transit lines.',
      zh: '评估通勤时长、地铁可达性与规划线路。',
    },
    usage: 9455,
    health: '#10B981',
    color: '#4F7CFF',
  },
  {
    id: 'policy',
    icon: 'policy',
    name: { en: 'Policy Analysis', zh: '政策解读' },
    tag: 'gov.policy',
    desc: {
      en: 'Interprets purchase limits, taxes, and local 楼市 policy.',
      zh: '解读限购、税费与地方楼市政策。',
    },
    usage: 7330,
    health: '#10B981',
    color: '#00D4FF',
  },
  {
    id: 'knowledge',
    icon: 'brain',
    name: { en: 'Knowledge Base', zh: '知识库' },
    tag: 'rag.retrieve',
    desc: {
      en: 'Grounds answers in your indexed documents via RAG.',
      zh: '基于 RAG 从已索引文档中检索佐证。',
    },
    usage: 19872,
    health: '#10B981',
    color: '#10B981',
  },
  {
    id: 'web',
    icon: 'globe',
    name: { en: 'Web Search', zh: '联网搜索' },
    tag: 'web.search',
    desc: {
      en: 'Pulls fresh listings and news from the live web.',
      zh: '从实时网络抓取最新房源与资讯。',
    },
    usage: 16201,
    health: '#10B981',
    color: '#7C3AED',
  },
];

/** The five core advisory agents, in execution order. */
export const CORE_PIPELINE: AgentDef[] = [
  AGENTS.find((a) => a.id === 'search')!,
  AGENTS.find((a) => a.id === 'market')!,
  AGENTS.find((a) => a.id === 'investment')!,
  AGENTS.find((a) => a.id === 'mortgage')!,
  {
    id: 'coordinator',
    icon: 'sparkle',
    name: { en: 'Coordinator', zh: '协调智能体' },
    tag: 'orchestrator.coordinator',
    desc: {
      en: 'Aggregates every agent result and synthesises the final report.',
      zh: '汇总所有智能体结果并生成最终报告。',
    },
    usage: 11240,
    health: '#10B981',
    color: '#7C3AED',
  },
];

export const getAgent = (id: string): AgentDef | undefined =>
  [...AGENTS, ...CORE_PIPELINE].find((a) => a.id === id);
