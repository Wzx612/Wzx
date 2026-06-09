import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import AppShell from '@/components/layout/AppShell';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { wait } from '@/lib/format';
import type { WfNode, WfNodeType, WfEdge, Bi } from '@/types';

const TYPES: Record<WfNodeType, { label: Bi; color: string; icon: string }> = {
  input: { label: { en: 'Input', zh: '输入' }, color: '#94A3B8', icon: 'plus' },
  agent: { label: { en: 'Agent', zh: '智能体' }, color: '#4F7CFF', icon: 'bot' },
  llm: { label: { en: 'LLM', zh: '大模型' }, color: '#7C3AED', icon: 'sparkle' },
  rag: { label: { en: 'RAG', zh: '检索增强' }, color: '#10B981', icon: 'book' },
  mcp: { label: { en: 'MCP Tool', zh: 'MCP 工具' }, color: '#00D4FF', icon: 'tool' },
  condition: { label: { en: 'Condition', zh: '条件分支' }, color: '#F59E0B', icon: 'workflow' },
  api: { label: { en: 'API Call', zh: 'API 调用' }, color: '#00D4FF', icon: 'globe' },
  memory: { label: { en: 'Memory', zh: '记忆' }, color: '#7C3AED', icon: 'db' },
  knowledge: { label: { en: 'Knowledge', zh: '知识节点' }, color: '#10B981', icon: 'shield' },
  output: { label: { en: 'Output', zh: '输出' }, color: '#10B981', icon: 'send' },
};
const PALETTE: WfNodeType[] = ['agent', 'llm', 'rag', 'mcp', 'condition', 'api', 'memory', 'knowledge'];
const NODE_W = 196;

const INITIAL_NODES: WfNode[] = [
  { id: 'n1', type: 'input', x: 60, y: 230, label: { en: 'User Query', zh: '用户查询' }, desc: { en: 'Property question from chat', zh: '来自对话的购房问题' }, meta: ['text'] },
  { id: 'n2', type: 'agent', x: 330, y: 230, label: { en: 'Planner Agent', zh: '规划智能体' }, desc: { en: 'Decompose into subtasks', zh: '拆解为子任务' }, meta: ['gpt-5', 'plan'] },
  { id: 'n3', type: 'rag', x: 610, y: 90, label: { en: 'Knowledge Retrieval', zh: '知识检索' }, desc: { en: 'top-k=6 · 学区库', zh: 'top-k=6 · 学区库' }, meta: ['vector', 'k6'] },
  { id: 'n4', type: 'mcp', x: 610, y: 250, label: { en: 'Map Tool', zh: '地图工具' }, desc: { en: '高德 · commute & schools', zh: '高德 · 通勤与学区' }, meta: ['mcp'] },
  { id: 'n5', type: 'condition', x: 610, y: 410, label: { en: 'Budget Check', zh: '预算判断' }, desc: { en: 'price ≤ budget ?', zh: '单价 ≤ 预算 ?' }, meta: ['if/else'] },
  { id: 'n6', type: 'llm', x: 900, y: 230, label: { en: 'Synthesis', zh: '综合推理' }, desc: { en: 'Merge agent outputs', zh: '汇总各智能体输出' }, meta: ['claude'] },
  { id: 'n7', type: 'output', x: 1170, y: 230, label: { en: 'Cited Answer', zh: '带引用答案' }, desc: { en: 'Streamed to user', zh: '流式返回用户' }, meta: ['stream'] },
];
const INITIAL_EDGES: WfEdge[] = [
  ['n1', 'n2'], ['n2', 'n3'], ['n2', 'n4'], ['n2', 'n5'], ['n3', 'n6'], ['n4', 'n6'], ['n5', 'n6'], ['n6', 'n7'],
];

export default function Workflow() {
  const { b, lang } = useT();
  const [nodes, setNodes] = useState<WfNode[]>(INITIAL_NODES);
  const [edges] = useState<WfEdge[]>(INITIAL_EDGES);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 30, y: 20 });
  const [runningId, setRunningId] = useState<string | null>(null);
  const uidRef = useRef(100);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const nodeById = useCallback((id: string) => nodes.find((n) => n.id === id), [nodes]);

  // global mouse handlers for node-drag and canvas-pan
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const d = dragRef.current;
        const nx = d.ox + (e.clientX - d.sx) / zoom;
        const ny = d.oy + (e.clientY - d.sy) / zoom;
        setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: nx, y: ny } : n)));
      } else if (panRef.current) {
        const p = panRef.current;
        setPan({ x: p.px + (e.clientX - p.sx), y: p.py + (e.clientY - p.sy) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      panRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [zoom]);

  const addNode = (type: WfNodeType, x: number, y: number) => {
    const id = `n${uidRef.current++}`;
    const t = TYPES[type];
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        x,
        y,
        label: { en: `${t.label.en} ${uidRef.current - 100}`, zh: `${t.label.zh}` },
        desc: { en: `New ${type} node`, zh: `新建${t.label.zh}节点` },
        meta: [type],
      },
    ]);
    setSelected(id);
  };

  const runFlow = async () => {
    const order = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'];
    for (const id of order) {
      setRunningId(id);
      await wait(500);
    }
    setRunningId(null);
  };

  const edgePath = (a: string, c: string): { d: string; color: string } | null => {
    const na = nodeById(a);
    const nb = nodeById(c);
    if (!na || !nb) return null;
    const x1 = na.x + NODE_W;
    const y1 = na.y + 46;
    const x2 = nb.x;
    const y2 = nb.y + 46;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, color: TYPES[nb.type].color };
  };

  const Play = getIcon('play');
  const ZoomIn = getIcon('plus');
  const selectedNode = selected ? nodeById(selected) : null;

  return (
    <AppShell title={{ en: 'Workflow Builder', zh: '工作流编排' }} crumb="atlas / workspace / workflow" fixedHeight bare>
      <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr 296px', height: 'calc(100vh - var(--topbar-h))', minHeight: 0 }}>
        {/* palette */}
        <aside style={{ borderRight: '1px solid var(--glass-border)', padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="nav-group-label">{lang === 'zh' ? '节点' : 'Nodes'}</div>
          {PALETTE.map((type) => {
            const t = TYPES[type];
            const Icon = getIcon(t.icon);
            return (
              <div
                key={type}
                className="card-hover"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('type', type)}
                onClick={() => addNode(type, 360 + Math.random() * 60, 180 + Math.random() * 60)}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-border)', background: 'var(--surface-1)', cursor: 'grab' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${t.color},${t.color}99)` }}>
                  <Icon color="#fff" size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{b(t.label)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{type} node</div>
                </div>
              </div>
            );
          })}
        </aside>

        {/* canvas */}
        <div
          ref={wrapRef}
          style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-2)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.grid) {
              panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
              setSelected(null);
            }
          }}
          onWheel={(e) => {
            const f = e.deltaY > 0 ? 0.92 : 1.08;
            setZoom((z) => Math.min(2, Math.max(0.4, z * f)));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('type') as WfNodeType;
            if (!type) return;
            const rect = wrapRef.current!.getBoundingClientRect();
            const x = (e.clientX - rect.left - pan.x) / zoom - NODE_W / 2;
            const y = (e.clientY - rect.top - pan.y) / zoom - 40;
            addNode(type, x, y);
          }}
        >
          <div
            data-grid="1"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />

          {/* toolbar */}
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 5 }}>
              <button className="icon-btn" style={{ width: 32, height: 32, background: 'transparent', border: 'none' }} onClick={() => setZoom((z) => Math.max(0.4, z / 1.15))}>
                <span style={{ fontSize: 18 }}>−</span>
              </button>
              <span className="mono" style={{ fontSize: 12, color: 'var(--sub)', minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button className="icon-btn" style={{ width: 32, height: 32, background: 'transparent', border: 'none' }} onClick={() => setZoom((z) => Math.min(2, z * 1.15))}>
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="flex-1" />
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px' }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--sub)' }}>
                {lang === 'zh' ? '房产顾问工作流' : 'Estate Advisory Flow'}
              </span>
              <span className="badge badge-success">
                <span className="badge-dot" />saved
              </span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => void runFlow()}>
              <Play size={15} />
              {lang === 'zh' ? '运行流程' : 'Run Flow'}
            </button>
          </div>

          {/* transformed canvas */}
          <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
            <svg style={{ position: 'absolute', inset: 0, width: 4000, height: 3000, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}>
              <defs>
                <marker id="wf-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M1 1 L8 4.5 L1 8" fill="none" stroke="#4F7CFF" strokeWidth="1.6" />
                </marker>
              </defs>
              {edges.map(([a, c], i) => {
                const ep = edgePath(a, c);
                if (!ep) return null;
                return (
                  <g key={i}>
                    <path d={ep.d} fill="none" stroke={ep.color} strokeOpacity="0.7" strokeWidth="2.4" markerEnd="url(#wf-arrow)" />
                    <circle r="3.2" fill={ep.color}>
                      <animateMotion dur="2.6s" repeatCount="indefinite" path={ep.d} />
                    </circle>
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const t = TYPES[n.type];
              const Icon = getIcon(t.icon);
              const isSel = selected === n.id;
              const isRun = runningId === n.id;
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
                    setSelected(n.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    borderRadius: 14,
                    zIndex: 2,
                    background: 'var(--surface-2)',
                    backdropFilter: 'var(--glass-blur)',
                    border: `1px solid ${isSel ? 'var(--primary)' : isRun ? 'var(--secondary)' : 'var(--glass-border-strong)'}`,
                    boxShadow: isRun
                      ? '0 0 0 2px rgba(0,212,255,0.5), 0 0 30px rgba(0,212,255,0.4)'
                      : isSel
                        ? '0 0 0 2px rgba(79,124,255,0.4), var(--shadow-lg)'
                        : 'var(--shadow-md)',
                    cursor: 'grab',
                    userSelect: 'none',
                  }}
                >
                  <div className="row gap-3" style={{ padding: '11px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${t.color},${t.color}99)` }}>
                      <Icon color="#fff" size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.1 }}>{b(n.label)}</div>
                      <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase' }}>{t.label.en}</div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--sub)', lineHeight: 1.4 }}>{b(n.desc)}</div>
                  <div className="row gap-2" style={{ padding: '0 12px 11px' }}>
                    {n.meta.map((m) => (
                      <span key={m} className="mono" style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 5, background: 'var(--surface-3)', color: 'var(--sub)' }}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* inspector */}
        <aside style={{ borderLeft: '1px solid var(--glass-border)', padding: '18px 16px', overflowY: 'auto' }}>
          {selectedNode ? (
            <Inspector node={selectedNode} onLabel={(val) => setNodes((p) => p.map((x) => (x.id === selectedNode.id ? { ...x, label: lang === 'zh' ? { ...x.label, zh: val } : { ...x.label, en: val } } : x)))} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '30vh', fontSize: 13 }}>
              {lang === 'zh' ? '选择节点以编辑其配置' : 'Select a node to edit its configuration'}
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Inspector({ node, onLabel }: { node: WfNode; onLabel: (v: string) => void }) {
  const { b, lang } = useT();
  const t = TYPES[node.type];
  const Icon = getIcon(t.icon);
  const labelStyle: CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' };
  const inputStyle: CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' };

  return (
    <div>
      <div className="row gap-3" style={{ marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${t.color},${t.color}99)` }}>
          <Icon color="#fff" size={20} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 680 }}>{b(node.label)}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{node.type} · {node.id}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{lang === 'zh' ? '节点名称' : 'Node Label'}</label>
        <input style={inputStyle} value={b(node.label)} onChange={(e) => onLabel(e.target.value)} />
      </div>

      {(node.type === 'agent' || node.type === 'llm') && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{lang === 'zh' ? '模型' : 'Model'}</label>
            <select style={inputStyle} defaultValue="GPT-5">
              <option>GPT-5</option>
              <option>Claude 4.5</option>
              <option>Gemini 2.5</option>
              <option>DeepSeek V3</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{lang === 'zh' ? '系统提示词' : 'System Prompt'}</label>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} defaultValue={lang === 'zh' ? `你是一名专注中国楼市的房产${t.label.zh}…` : `You are a real-estate ${node.type} specialized in 中国楼市…`} />
          </div>
        </>
      )}
      {(node.type === 'rag' || node.type === 'knowledge') && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{lang === 'zh' ? '知识库' : 'Knowledge Base'}</label>
          <select style={inputStyle}>
            <option>北京学区库 (12.4k docs)</option>
            <option>政策法规库 (3.1k docs)</option>
            <option>成交价指数库</option>
          </select>
        </div>
      )}
      {node.type === 'condition' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{lang === 'zh' ? '判断表达式' : 'Expression'}</label>
          <input className="mono" style={inputStyle} defaultValue="price_per_sqm <= budget" />
        </div>
      )}

      <div style={{ marginTop: 18, borderTop: '1px solid var(--glass-border)', paddingTop: 14 }}>
        <label className="mono" style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {lang === 'zh' ? '上次运行' : 'Last Run'}
        </label>
        <div className="row gap-3" style={{ fontSize: 12, padding: '6px 0', color: 'var(--sub)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
          {lang === 'zh' ? '执行成功' : 'Executed successfully'}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>312 tok</span>
        </div>
        <div className="row gap-3" style={{ fontSize: 12, padding: '6px 0', color: 'var(--sub)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--secondary)' }} />
          {lang === 'zh' ? '延迟' : 'Latency'}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>0.84s</span>
        </div>
      </div>
    </div>
  );
}
