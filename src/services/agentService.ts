import type { AgentId, AgentRunResult, Property, FinalReport } from '@/types';
import { USE_MOCK, api } from './api';
import { wait } from '@/lib/format';
import { PROPERTIES } from '@/mock/properties';
import { FINAL_REPORT } from '@/mock/analytics';

/* ============================================================
   Agent service.
   Each method maps to a LangGraph node on the FastAPI backend.
   When no backend is configured it resolves from mock data with
   realistic latency so status animations read naturally.
   ============================================================ */

const SUMMARIES: Record<AgentId, AgentRunResult['summary']> = {
  search: {
    en: 'Matched 20 listings · 6 strong fits under budget filters.',
    zh: '匹配 20 套房源 · 6 套高度符合预算筛选。',
  },
  market: {
    en: 'Haidian index +6.2% YoY · inventory tightening, demand high.',
    zh: '海淀指数同比 +6.2% · 库存收紧、需求旺盛。',
  },
  investment: {
    en: 'Projected 8-yr cumulative return 58.4% · ROI score 79.',
    zh: '预计 8 年累计回报 58.4% · 投资评分 79。',
  },
  mortgage: {
    en: 'ICBC 3.95% / 30% down → ¥31,204 monthly. Best fit found.',
    zh: '工行 3.95% / 三成首付 → 月供 ¥31,204，最优方案。',
  },
  coordinator: {
    en: 'Synthesised 4 agent outputs → composite score 84, BUY.',
    zh: '汇总 4 个智能体输出 → 综合评分 84，建议买入。',
  },
  school: { en: 'Top-tier catchment confirmed.', zh: '确认顶级学区划片。' },
  legal: { en: 'No title or contract risks flagged.', zh: '未发现产权或合同风险。' },
  transport: { en: 'Metro within 600m · 32-min CBD commute.', zh: '地铁 600 米内 · 通勤 CBD 32 分钟。' },
  policy: { en: 'Purchase limits applicable; first-home eligible.', zh: '适用限购；符合首套资格。' },
  knowledge: { en: '6 grounding documents retrieved.', zh: '检索到 6 份佐证文档。' },
  web: { en: '12 fresh listings pulled from the web.', zh: '从网络抓取 12 套最新房源。' },
  planner: { en: 'Query decomposed into 4 subtasks.', zh: '查询拆解为 4 个子任务。' },
};

const LATENCY: Partial<Record<AgentId, number>> = {
  search: 1.2,
  market: 0.9,
  investment: 1.1,
  mortgage: 0.8,
  coordinator: 1.4,
};

const TOKENS: Partial<Record<AgentId, number>> = {
  search: 412,
  market: 318,
  investment: 524,
  mortgage: 286,
  coordinator: 642,
};

export const agentService = {
  /** Simulated planning / thinking phase before execution. */
  async think(id: AgentId): Promise<void> {
    await wait(420 + (id === 'coordinator' ? 220 : 0));
  },

  /** Execute a single agent node and return its result. */
  async execute(id: AgentId): Promise<AgentRunResult> {
    if (!USE_MOCK) {
      const { data } = await api.post<AgentRunResult>(`/agents/${id}/run`);
      return data;
    }
    await wait(520);
    return {
      id,
      status: 'completed',
      latency: LATENCY[id] ?? 0.7,
      tokens: TOKENS[id] ?? 300,
      summary: SUMMARIES[id],
    };
  },

  /** Search agent: fetch matching properties. */
  async searchProperties(): Promise<Property[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<Property[]>('/properties');
      return data;
    }
    await wait(400);
    return PROPERTIES;
  },

  /** Coordinator: produce the synthesised report. */
  async getReport(): Promise<FinalReport> {
    if (!USE_MOCK) {
      const { data } = await api.get<FinalReport>('/report');
      return data;
    }
    await wait(600);
    return FINAL_REPORT;
  },
};
