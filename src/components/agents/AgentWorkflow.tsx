import { motion } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { CORE_PIPELINE } from '@/mock/agents';
import { useAgentStore } from '@/store/agentStore';
import StatusBadge from './StatusBadge';
import type { AgentStatus } from '@/types';

const RING: Record<AgentStatus, string> = {
  idle: 'var(--glass-border)',
  thinking: 'var(--secondary)',
  running: 'var(--primary)',
  completed: 'var(--success)',
  error: 'var(--danger)',
};

export default function AgentWorkflow() {
  const { b, t, lang } = useT();
  const runtimes = useAgentStore((s) => s.runtimes);
  const running = useAgentStore((s) => s.running);
  const startRun = useAgentStore((s) => s.startRun);
  const reset = useAgentStore((s) => s.reset);
  const Play = getIcon('play');

  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 650 }}>
            {lang === 'zh' ? '智能体工作流' : 'Agent Workflow'}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 2 }}>
            {lang === 'zh'
              ? '五个智能体顺序协同，输出最终购房建议'
              : 'Five agents collaborate in sequence to produce the final advice'}
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-sm btn-ghost" onClick={reset} disabled={running}>
            {lang === 'zh' ? '重置' : 'Reset'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={startRun} disabled={running}>
            <Play size={14} />
            {running
              ? lang === 'zh'
                ? '执行中…'
                : 'Running…'
              : lang === 'zh'
                ? '运行工作流'
                : 'Run Workflow'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {CORE_PIPELINE.map((agent, i) => {
          const rt = runtimes[agent.id];
          const status = rt?.status ?? 'idle';
          const Icon = getIcon(agent.icon);
          const active = status === 'thinking' || status === 'running';
          return (
            <div key={agent.id}>
              <motion.div
                className="row gap-4"
                style={{
                  padding: 14,
                  borderRadius: 'var(--r)',
                  border: `1px solid ${active ? RING[status] : 'var(--glass-border)'}`,
                  background: active ? 'var(--surface-2)' : 'var(--surface-1)',
                  boxShadow: active ? `0 0 0 2px ${RING[status]}44, 0 0 24px ${RING[status]}33` : 'none',
                }}
                animate={{ scale: active ? 1.01 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    background: `linear-gradient(135deg, ${agent.color}, ${agent.color}99)`,
                  }}
                  animate={
                    active
                      ? { boxShadow: [`0 0 0 0 ${agent.color}66`, `0 0 0 10px ${agent.color}00`] }
                      : {}
                  }
                  transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
                >
                  <Icon color="#fff" size={22} />
                </motion.div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ marginBottom: 3 }}>
                    <span style={{ fontWeight: 650, fontSize: 14.5 }}>{b(agent.name)}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                      {agent.tag}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.4 }}>
                    {status === 'completed' && rt?.result
                      ? b(rt.result.summary)
                      : b(agent.desc)}
                  </div>
                  {status === 'completed' && rt?.result && (
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5 }}
                    >
                      {rt.result.latency}s · {rt.result.tokens} tok
                    </div>
                  )}
                </div>

                <StatusBadge status={status} />
              </motion.div>

              {i < CORE_PIPELINE.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                  <motion.svg
                    width="20"
                    height="26"
                    viewBox="0 0 20 26"
                    fill="none"
                    aria-hidden
                  >
                    <motion.line
                      x1="10"
                      y1="0"
                      x2="10"
                      y2="20"
                      stroke={
                        runtimes[CORE_PIPELINE[i + 1].id]?.status !== 'idle'
                          ? agent.color
                          : 'var(--glass-border-strong)'
                      }
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      animate={{ strokeDashoffset: running ? [0, -16] : 0 }}
                      transition={{ duration: 0.8, repeat: running ? Infinity : 0, ease: 'linear' }}
                    />
                    <path
                      d="M5 16l5 5 5-5"
                      stroke={
                        runtimes[CORE_PIPELINE[i + 1].id]?.status !== 'idle'
                          ? agent.color
                          : 'var(--glass-border-strong)'
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </motion.svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="mono"
        style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14, textAlign: 'center' }}
      >
        {t('nav.report')} · orchestrator v2.4
      </div>
    </div>
  );
}
