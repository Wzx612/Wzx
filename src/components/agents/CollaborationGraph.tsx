import { useMemo } from 'react';
import { useT } from '@/lib/useT';

interface GNode {
  x: number;
  y: number;
  r: number;
  label: { en: string; zh: string };
  color: string;
}

const NODES: GNode[] = [
  { x: 70, y: 210, r: 30, label: { en: 'User Query', zh: '用户查询' }, color: '#94A3B8' },
  { x: 250, y: 210, r: 34, label: { en: 'Planner', zh: '规划器' }, color: '#4F7CFF' },
  { x: 460, y: 210, r: 30, label: { en: 'Decompose', zh: '任务拆解' }, color: '#4F7CFF' },
  { x: 690, y: 90, r: 26, label: { en: 'Search', zh: '搜索' }, color: '#7C3AED' },
  { x: 690, y: 210, r: 26, label: { en: 'Market', zh: '市场' }, color: '#7C3AED' },
  { x: 690, y: 330, r: 26, label: { en: 'Mortgage', zh: '房贷' }, color: '#7C3AED' },
  { x: 900, y: 130, r: 28, label: { en: 'Retrieval', zh: '知识检索' }, color: '#00D4FF' },
  { x: 900, y: 290, r: 28, label: { en: 'Tool Call', zh: '工具调用' }, color: '#00D4FF' },
  { x: 1110, y: 210, r: 32, label: { en: 'Response', zh: '响应生成' }, color: '#10B981' },
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7], [6, 8], [7, 8],
];

export default function CollaborationGraph() {
  const { b, lang } = useT();

  const edgePaths = useMemo(
    () =>
      EDGES.map(([a, c]) => {
        const na = NODES[a];
        const nb = NODES[c];
        const mx = (na.x + nb.x) / 2;
        return {
          d: `M ${na.x} ${na.y} C ${mx} ${na.y}, ${mx} ${nb.y}, ${nb.x} ${nb.y}`,
          color: nb.color,
        };
      }),
    [],
  );

  return (
    <div
      className="card"
      style={{
        padding: 28,
        minHeight: 360,
        overflow: 'hidden',
        background:
          'radial-gradient(100% 100% at 50% 0%, rgba(79,124,255,0.07), transparent 60%), var(--surface-1)',
      }}
    >
      <svg
        viewBox="0 0 1180 420"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 420, display: 'block' }}
      >
        <defs>
          <filter id="cg-glow">
            <feGaussianBlur stdDeviation="3.5" result="bl" />
            <feMerge>
              <feMergeNode in="bl" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {NODES.map((n, i) => (
            <radialGradient id={`cg-${i}`} key={i}>
              <stop offset="0%" stopColor={n.color} />
              <stop offset="100%" stopColor={`${n.color}99`} />
            </radialGradient>
          ))}
        </defs>

        {edgePaths.map((e, i) => (
          <g key={i}>
            <path
              d={e.d}
              fill="none"
              stroke={e.color}
              strokeOpacity="0.32"
              strokeWidth="1.6"
              strokeDasharray="5 7"
              style={{ animation: 'dash 1.2s linear infinite' }}
            />
            <circle r="3" fill={e.color} style={{ animation: 'pulse-travel 2.4s ease infinite', animationDelay: `${i * 0.22}s` }}>
              <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${i * 0.22}s`} path={e.d} />
            </circle>
          </g>
        ))}

        {NODES.map((n, i) => (
          <g key={i} style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={n.r} fill={`url(#cg-${i})`} filter="url(#cg-glow)" opacity="0.95" />
            <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke="#fff" strokeOpacity="0.18" />
            <text
              x={n.x}
              y={n.y + n.r + 16}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="12.5"
              fontWeight="600"
            >
              {b(n.label)}
            </text>
          </g>
        ))}
      </svg>

      <div className="row gap-6" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        {[
          { c: '#4F7CFF', l: { en: 'Planner', zh: '规划器' } },
          { c: '#7C3AED', l: { en: 'Agents', zh: '智能体' } },
          { c: '#00D4FF', l: { en: 'Retrieval / Tools', zh: '检索 / 工具' } },
          { c: '#10B981', l: { en: 'Response', zh: '响应生成' } },
        ].map((leg, i) => (
          <div key={i} className="row gap-2" style={{ fontSize: 12, color: 'var(--sub)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: leg.c }} />
            {lang === 'zh' ? leg.l.zh : leg.l.en}
          </div>
        ))}
      </div>
    </div>
  );
}
