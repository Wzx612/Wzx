import type { Metric } from '@/types';
import { USE_MOCK, api } from './api';
import { METRICS } from '@/mock/analytics';

/* ============================================================
   Metrics service.
   Backend: GET /analytics/metrics → Metric[]
   Fallback: METRICS from mock/analytics with session overlay.
   ============================================================ */

export async function fetchDashboardMetrics(): Promise<Metric[]> {
  if (!USE_MOCK) {
    try {
      const { data } = await api.get<Metric[]>('/analytics/metrics');
      return data;
    } catch {
      /* backend unreachable — use mock */
    }
  }
  return METRICS;
}

/**
 * Merge live session counts into the base metric array.
 * Mutates nothing — returns a new array.
 */
export function overlaySession(
  base: Metric[],
  sessionData: { chatSessions: number; kbDocs: number; agentRuns: number },
): Metric[] {
  return base.map((m) => {
    /* "Daily Analyses" gets a bump from in-session chat conversations. */
    if (m.label.en === 'Daily Analyses' && sessionData.chatSessions > 0) {
      return {
        ...m,
        value: m.value + sessionData.chatSessions,
        delta: `+${sessionData.chatSessions} this session`,
        up: true,
      };
    }
    /* "Active Agents" reflects agents that completed at least one run this session. */
    if (m.label.en === 'Active Agents' && sessionData.agentRuns > 0) {
      return { ...m, value: m.value + sessionData.agentRuns, delta: `+${sessionData.agentRuns} ran`, up: true };
    }
    return m;
  });
}
