import { useT } from '@/lib/useT';
import { cn } from '@/lib/format';
import type { AgentStatus, Bi } from '@/types';

const LABEL: Record<AgentStatus, Bi> = {
  idle: { en: 'Idle', zh: '待命' },
  thinking: { en: 'Thinking', zh: '思考中' },
  running: { en: 'Running', zh: '执行中' },
  completed: { en: 'Completed', zh: '已完成' },
  error: { en: 'Error', zh: '错误' },
};

const COLOR: Record<AgentStatus, string> = {
  idle: 'var(--muted)',
  thinking: 'var(--secondary)',
  running: 'var(--primary)',
  completed: 'var(--success)',
  error: 'var(--danger)',
};

export default function StatusBadge({ status }: { status: AgentStatus }) {
  const { b } = useT();
  const spinning = status === 'thinking' || status === 'running';
  return (
    <span
      className="badge"
      style={{ color: COLOR[status], borderColor: 'transparent', background: 'var(--surface-2)' }}
    >
      <span
        className={cn('badge-dot', status === 'completed' && 'pulse-dot')}
        style={{
          background: COLOR[status],
          animation: spinning ? 'pulse-ring 1.4s var(--ease-out) infinite' : undefined,
        }}
      />
      {b(LABEL[status])}
    </span>
  );
}
