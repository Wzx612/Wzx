import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { fmtNum } from '@/lib/format';
import type { AgentDef, AgentStatus } from '@/types';

const STATUS_COLOR: Partial<Record<AgentStatus, string>> = {
  thinking:  '#00D4FF',
  running:   '#4F7CFF',
  completed: '#10B981',
  error:     '#F43F5E',
};

export default function AgentCard({
  agent,
  index,
  runtimeStatus,
}: {
  agent: AgentDef;
  index: number;
  runtimeStatus?: AgentStatus;
}) {
  const { b, t } = useT();
  const navigate = useNavigate();
  const Icon = getIcon(agent.icon);
  const Play = getIcon('play');
  const healthColor = (runtimeStatus && STATUS_COLOR[runtimeStatus]) ?? agent.health;
  const isActive = runtimeStatus === 'running' || runtimeStatus === 'thinking';

  return (
    <motion.div
      className="card card-hover"
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 13, cursor: 'pointer' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.045, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate('/chat')}
    >
      <div className="row gap-3">
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
            background: `linear-gradient(135deg, ${agent.color}, ${agent.color}99)`,
          }}
        >
          <Icon color="#fff" size={22} />
          <span
            style={{
              position: 'absolute',
              bottom: -3,
              right: -3,
              width: 13,
              height: 13,
              borderRadius: '50%',
              border: '2.5px solid var(--bg-2)',
              background: healthColor,
              boxShadow: isActive ? `0 0 0 3px ${healthColor}44` : 'none',
              transition: 'background 0.4s, box-shadow 0.4s',
            }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: '-0.01em' }}>
            {b(agent.name)}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            {agent.tag}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: 'var(--sub)',
          lineHeight: 1.45,
          flex: 1,
          minHeight: 38,
        }}
      >
        {b(agent.desc)}
      </div>

      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          paddingTop: 4,
          borderTop: '1px solid var(--glass-border)',
        }}
      >
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--sub)' }}>
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtNum(agent.usage)}</b>{' '}
          {t('common.runs')}
        </span>
        <button
          className="btn btn-sm btn-ghost"
          style={{ borderRadius: 'var(--r-pill)', gap: 6 }}
          onClick={(e) => {
            e.stopPropagation();
            navigate('/chat');
          }}
        >
          <Play size={13} />
          {t('common.run')}
        </button>
      </div>
    </motion.div>
  );
}
