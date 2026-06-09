import { create } from 'zustand';
import type { AgentId, AgentStatus, AgentRunResult } from '@/types';
import { CORE_PIPELINE } from '@/mock/agents';
import { agentService } from '@/services/agentService';

export interface AgentRuntime {
  id: AgentId;
  status: AgentStatus;
  result?: AgentRunResult;
}

interface AgentStoreState {
  /** runtime state for each core-pipeline agent */
  runtimes: Record<string, AgentRuntime>;
  /** id of the agent currently executing, if any */
  activeId: AgentId | null;
  running: boolean;
  /** whether the coordinator has produced a report */
  reportReady: boolean;
  startRun: () => Promise<void>;
  reset: () => void;
  /** force a single agent into the error state (demo of the error branch) */
  failAgent: (id: AgentId) => void;
}

const initialRuntimes = (): Record<string, AgentRuntime> => {
  const map: Record<string, AgentRuntime> = {};
  CORE_PIPELINE.forEach((a) => {
    map[a.id] = { id: a.id, status: 'idle' };
  });
  return map;
};

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  runtimes: initialRuntimes(),
  activeId: null,
  running: false,
  reportReady: false,

  reset: () =>
    set({ runtimes: initialRuntimes(), activeId: null, running: false, reportReady: false }),

  failAgent: (id) =>
    set((s) => ({
      runtimes: { ...s.runtimes, [id]: { ...s.runtimes[id], status: 'error' } },
    })),

  startRun: async () => {
    if (get().running) return;
    get().reset();
    set({ running: true });

    for (const agent of CORE_PIPELINE) {
      // Idle → Thinking
      set((s) => ({
        activeId: agent.id,
        runtimes: { ...s.runtimes, [agent.id]: { id: agent.id, status: 'thinking' } },
      }));
      await agentService.think(agent.id);

      // Thinking → Running
      set((s) => ({
        runtimes: { ...s.runtimes, [agent.id]: { id: agent.id, status: 'running' } },
      }));

      const result = await agentService.execute(agent.id);

      // Running → Completed
      set((s) => ({
        runtimes: {
          ...s.runtimes,
          [agent.id]: { id: agent.id, status: 'completed', result },
        },
      }));
    }

    set({ activeId: null, running: false, reportReady: true });
  },
}));
