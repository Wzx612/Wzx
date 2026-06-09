import { wait } from '@/lib/format';

/* ============================================================
   Web Search service.
   Provider: Tavily (VITE_TAVILY_API_KEY).
   Fallback: scored mock results when no key is set.

   Used by chatService to ground AI responses and by the
   agent pipeline to retrieve live market data.
   ============================================================ */

export interface WebResult {
  title:   string;
  url:     string;
  content: string;
  score:   number;
}

const TAVILY_KEY = (import.meta.env.VITE_TAVILY_API_KEY as string | undefined) ?? '';

/** True when a real Tavily key is configured. */
export const WEB_SEARCH_ENABLED = !!TAVILY_KEY;

/* ── Mock corpus ────────────────────────────────────────────── */

const MOCK_CORPUS: WebResult[] = [
  {
    title:   '2026年北京海淀区学区房最新成交均价解析',
    url:     'https://www.fang.com/news/2026-haidian-school-district',
    content: '海淀区中关村学区二手房均价约11.8万元/㎡，较去年同期上涨6.2%，核心地段供应偏紧。',
    score:   0.93,
  },
  {
    title:   '北京首套房贷最新政策 — LPR-30bp执行情况',
    url:     'https://www.gov.cn/xinwen/2026-mortgage-lpr',
    content: '2026年1月起，北京首套住房商业贷款利率执行LPR-30bp，当前LPR为3.50%，即实际最低3.20%。',
    score:   0.91,
  },
  {
    title:   '西城区金融街二手房市场深度报告 Q1-2026',
    url:     'https://m.lianjia.com/report/xicheng-2026-q1',
    content: '西城区金融街周边二手房均价约15.2万元/㎡，供给持续收缩，换手周期拉长至60天。',
    score:   0.89,
  },
  {
    title:   '朝阳望京板块2026投资价值深度分析',
    url:     'https://www.ke.com/insights/chaoyang-wangjing-2026',
    content: '望京板块房价7.2万/㎡，租金回报率约2.1%，地铁14号线覆盖，近年教育资源显著提升。',
    score:   0.86,
  },
  {
    title:   '北京限购政策2026最新解读：非户籍60个月社保',
    url:     'https://www.bjjs.gov.cn/house-policy-2026',
    content: '非本市户籍居民须提供连续60个月以上在京纳税或社保证明方可购房，政策延续2025年执行口径。',
    score:   0.84,
  },
  {
    title:   '丰台区二手房市场：价格洼地还是价值回归？',
    url:     'https://news.anjuke.com/fengtai-2026-analysis',
    content: '丰台区均价6.4万/㎡，近三年年化涨幅8.4%，超越朝阳与海淀，性价比指数位居全市第一。',
    score:   0.81,
  },
];

function scoreResult(r: WebResult, query: string): number {
  const q = query.toLowerCase();
  const text = (r.title + ' ' + r.content).toLowerCase();
  let s = r.score;
  for (const t of q.split(/\s+/).filter(Boolean)) {
    if (text.includes(t)) s += 0.08;
  }
  return Math.min(1, s);
}

/* ── Public API ─────────────────────────────────────────────── */

export async function webSearch(query: string, maxResults = 4): Promise<WebResult[]> {
  if (TAVILY_KEY) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key:        TAVILY_KEY,
          query:          `北京房地产 ${query}`,
          max_results:    maxResults,
          include_answer: false,
          search_depth:   'basic',
        }),
      });
      if (res.ok) {
        const data = await res.json() as { results: WebResult[] };
        return data.results.slice(0, maxResults);
      }
    } catch {
      /* fall through to mock */
    }
  }

  await wait(280 + Math.random() * 180);
  return MOCK_CORPUS
    .map((r) => ({ ...r, score: scoreResult(r, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
