import { useEffect, useRef, useState, type ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { API_BASE, USE_MOCK } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import type { Bi } from '@/types';

const HEALTH: { name: Bi; val: string; sub: Bi; pct: number; color: string }[] = [
  { name: { en: 'System Health', zh: '系统健康' }, val: '99.98%', sub: { en: 'all systems', zh: '全部正常' }, pct: 99.98, color: '#10B981' },
  { name: { en: 'CPU Load', zh: 'CPU 负载' }, val: '34%', sub: { en: '8 cores', zh: '8 核' }, pct: 34, color: '#4F7CFF' },
  { name: { en: 'Memory', zh: '内存' }, val: '62%', sub: { en: '40/64 GB', zh: '40/64 GB' }, pct: 62, color: '#00D4FF' },
  { name: { en: 'GPU Util', zh: 'GPU 占用' }, val: '78%', sub: { en: 'A100 ×4', zh: 'A100 ×4' }, pct: 78, color: '#7C3AED' },
];

const LOGS: [string, Bi][] = [
  ['ok', { en: 'agent.market completed in 0.7s', zh: 'agent.market 0.7s 完成' }],
  ['info', { en: 'planner decomposed query → 3 tasks', zh: '规划器拆解查询 → 3 个任务' }],
  ['ok', { en: 'RAG retrieval 6 chunks · 42ms', zh: 'RAG 检索 6 切片 · 42ms' }],
  ['warn', { en: 'amap.commute rate-limit 80%', zh: 'amap.commute 限流 80%' }],
  ['info', { en: 'mcp.lianjia cache hit', zh: 'mcp.lianjia 命中缓存' }],
  ['error', { en: 'llm.deepseek timeout, retrying', zh: 'llm.deepseek 超时，重试中' }],
  ['ok', { en: 'websocket reconnected · sess_4821', zh: 'websocket 重连 · sess_4821' }],
  ['ok', { en: 'workflow run #18402 success', zh: '工作流执行 #18402 成功' }],
];

const MON_AGENTS: { name: Bi; color: string }[] = [
  { name: { en: 'Market Analysis', zh: '市场分析' }, color: '#00D4FF' },
  { name: { en: 'Knowledge Base', zh: '知识库' }, color: '#10B981' },
  { name: { en: 'Property Search', zh: '房源搜索' }, color: '#4F7CFF' },
  { name: { en: 'Planner', zh: '规划器' }, color: '#7C3AED' },
  { name: { en: 'Web Search', zh: '联网搜索' }, color: '#F59E0B' },
];

function ring(pct: number, color: string) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 48 48" style={{ width: 48, height: 48, flexShrink: 0 }}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 24 24)" />
    </svg>
  );
}

function useLiveSeries(base: number, range: number) {
  const [data, setData] = useState<number[]>(() => Array.from({ length: 60 }, () => base + Math.random() * range));
  useEffect(() => {
    const iv = setInterval(() => {
      setData((prev) => {
        const next = [...prev, base + Math.random() * range + Math.sin(Date.now() / 2000) * range * 0.3];
        if (next.length > 60) next.shift();
        return next;
      });
    }, 1200);
    return () => clearInterval(iv);
  }, [base, range]);
  return data;
}

function LiveChart({ data, color }: { data: number[]; color: string }) {
  const W = 600;
  const H = 180;
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data) * 0.85;
  const xs = (i: number) => (i / (data.length - 1)) * W;
  const ys = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 24);
  const pts = data.map((v, i) => `${xs(i)},${ys(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block' }}>
      <defs>
        <linearGradient id={`lc-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#lc-${color})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={xs(data.length - 1)} cy={ys(data[data.length - 1])} r="3.5" fill={color} />
    </svg>
  );
}

export default function Monitoring() {
  const { b, lang } = useT();
  const tokenData = useLiveSeries(1200, 800);
  const apiData = useLiveSeries(400, 300);
  const [logs, setLogs] = useState<{ id: number; lv: string; msg: Bi; time: string }[]>([]);
  const [loads, setLoads] = useState<number[]>(MON_AGENTS.map(() => 50));
  const [ws, setWs] = useState<boolean[]>(() => Array.from({ length: 24 }, () => Math.random() > 0.25));
  const [wsCount, setWsCount] = useState(1284);
  const idRef = useRef(0);

  useEffect(() => {
    /* Simulation intervals — always running as fallback / augmentation. */
    const seed = () => {
      const [lv, msg] = LOGS[Math.floor(Math.random() * LOGS.length)];
      setLogs((prev) => [{ id: idRef.current++, lv, msg, time: new Date().toLocaleTimeString('en-GB') }, ...prev].slice(0, 30));
    };
    for (let i = 0; i < 10; i++) seed();
    const l = setInterval(seed, 1400);
    const a = setInterval(() => setLoads(MON_AGENTS.map(() => 30 + Math.floor(Math.random() * 60))), 2000);
    const w = setInterval(() => {
      setWs(Array.from({ length: 24 }, () => Math.random() > 0.25));
      setWsCount(1200 + Math.floor(Math.random() * 180));
    }, 1500);

    /* Real SSE stream when backend is configured. */
    let sse: EventSource | null = null;
    if (!USE_MOCK) {
      const token = useAuthStore.getState().tokens?.accessToken;
      const url   = `${API_BASE}/monitor/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      try {
        sse = new EventSource(url);
        sse.addEventListener('log', (e: MessageEvent<string>) => {
          try {
            const ev = JSON.parse(e.data) as { lv: string; msg: string };
            setLogs((prev) => [
              { id: idRef.current++, lv: ev.lv, msg: { en: ev.msg, zh: ev.msg }, time: new Date().toLocaleTimeString('en-GB') },
              ...prev,
            ].slice(0, 30));
          } catch { /* skip */ }
        });
        sse.addEventListener('agent_load', (e: MessageEvent<string>) => {
          try {
            const ev = JSON.parse(e.data) as { loads: number[] };
            if (Array.isArray(ev.loads)) setLoads(ev.loads);
          } catch { /* skip */ }
        });
        sse.addEventListener('ws_count', (e: MessageEvent<string>) => {
          try {
            const ev = JSON.parse(e.data) as { count: number };
            setWsCount(ev.count);
          } catch { /* skip */ }
        });
        sse.onerror = () => {
          /* SSE connection lost — simulation intervals continue. */
          sse?.close();
        };
      } catch {
        /* EventSource not available or URL invalid — simulation continues. */
      }
    }

    return () => {
      clearInterval(l);
      clearInterval(a);
      clearInterval(w);
      sse?.close();
    };
  }, []);

  const LV_COLOR: Record<string, string> = { ok: 'var(--success)', info: 'var(--secondary)', warn: 'var(--warning)', error: 'var(--danger)' };
  const Tok = getIcon('activity');
  const Api = getIcon('globe');
  const Msg = getIcon('chat');
  const Clock = getIcon('dot');
  const Bot = getIcon('bot');

  // gauge
  const gPct = 0.62;
  const cx = 100;
  const cy = 110;
  const gr = 78;
  const x0 = cx + gr * Math.cos(Math.PI);
  const y0 = cy + gr * Math.sin(Math.PI);
  const a1 = Math.PI + Math.PI * gPct;
  const x1 = cx + gr * Math.cos(a1);
  const y1 = cy + gr * Math.sin(a1);
  const xe = cx + gr * Math.cos(0);
  const ye = cy + gr * Math.sin(0);

  return (
    <AppShell title={{ en: 'Monitoring Center', zh: '监控中心' }} crumb="atlas / operations / monitoring">
      <PageHead
        title={{ en: 'Monitoring Center', zh: '监控中心' }}
        desc={{ en: 'Real-time observability across agents, tokens, APIs, latency, and connections.', zh: '对智能体、Token、API、延迟与连接的实时可观测性。' }}
      />

      <div className="grid-base grid-4" style={{ marginBottom: 22 }}>
        {HEALTH.map((h) => (
          <div key={h.name.en} className="card card-hover row gap-4" style={{ padding: '18px 20px' }}>
            {ring(h.pct, h.color)}
            <div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: h.color }}>{h.val}</div>
              <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>{b(h.name)}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{b(h.sub)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="col gap-4">
          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Tok size={16} />} title={{ en: 'Token Usage', zh: 'Token 用量' }} live />
            <LiveChart data={tokenData} color="#4F7CFF" />
            <div className="row gap-6" style={{ marginTop: 12 }}>
              <Mini value={Math.round(tokenData[tokenData.length - 1]).toLocaleString()} label={{ en: 'tokens/s', zh: '令牌/秒' }} color="#4F7CFF" />
              <Mini value="42.8M" label={{ en: 'today', zh: '今日' }} color="#00D4FF" />
              <Mini value="¥1,284" label={{ en: 'est. cost', zh: '预估成本' }} color="#10B981" />
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Api size={16} />} title={{ en: 'API Consumption', zh: 'API 调用' }} tag="req/min" />
            <LiveChart data={apiData} color="#00D4FF" />
          </div>
          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Msg size={16} />} title={{ en: 'Error Tracking', zh: '错误追踪' }} tag="0.3%" />
            <div style={{ height: 280, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {logs.map((l) => (
                <div key={l.id} className="row gap-3" style={{ padding: '6px 0', borderBottom: '1px solid var(--glass-border)', animation: 'fade-in 0.4s' }}>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{l.time}</span>
                  <span style={{ fontWeight: 700, width: 44, flexShrink: 0, color: LV_COLOR[l.lv] }}>{l.lv.toUpperCase()}</span>
                  <span style={{ color: 'var(--sub)', flex: 1, minWidth: 0 }}>{b(l.msg)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-4">
          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Clock size={16} />} title={{ en: 'Response Time', zh: '响应时间' }} />
            <svg viewBox="0 0 200 130" style={{ width: '100%', height: 130 }}>
              <path d={`M ${x0} ${y0} A ${gr} ${gr} 0 0 1 ${xe} ${ye}`} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="12" strokeLinecap="round" />
              <defs>
                <linearGradient id="gauge-grad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="60%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#F43F5E" />
                </linearGradient>
              </defs>
              <path d={`M ${x0} ${y0} A ${gr} ${gr} 0 0 1 ${x1} ${y1}`} fill="none" stroke="url(#gauge-grad)" strokeWidth="12" strokeLinecap="round" />
              <text x={cx} y={cy - 6} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--text)" fontFamily="var(--font-mono)">0.84</text>
              <text x={cx} y={cy + 14} textAnchor="middle" fontSize="12" fill="var(--sub)">{lang === 'zh' ? '平均秒' : 'avg seconds'}</text>
            </svg>
            <div className="row gap-6" style={{ justifyContent: 'center', marginTop: 6 }}>
              {[['0.84s', 'p50', '#10B981'], ['2.1s', 'p95', '#F59E0B'], ['4.6s', 'p99', '#F43F5E']].map(([v, l, c]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <b className="mono" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: c }}>{v}</b>
                  <span style={{ fontSize: 11, color: 'var(--sub)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Bot size={16} />} title={{ en: 'Agent Monitoring', zh: '智能体监控' }} />
            {MON_AGENTS.map((a, i) => (
              <div key={a.name.en} className="row gap-3" style={{ padding: '11px 0', borderBottom: i < MON_AGENTS.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, boxShadow: `0 0 8px ${a.color}` }} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{b(a.name)}</span>
                <div style={{ width: 100, height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${loads[i]}%`, background: a.color, borderRadius: 999, transition: 'width 0.8s var(--ease)' }} />
                </div>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--sub)', width: 50, textAlign: 'right' }}>{loads[i]}%</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <PanelTitle icon={<Api size={16} />} title={{ en: 'WebSocket Connections', zh: 'WebSocket 连接' }} tag={wsCount.toLocaleString()} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 10 }}>
              {ws.map((on, i) => (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 6,
                    background: on ? `rgba(16,185,129,${0.3 + Math.random() * 0.6})` : 'var(--surface-3)',
                    boxShadow: on && Math.random() > 0.7 ? '0 0 10px rgba(16,185,129,0.6)' : 'none',
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PanelTitle({ icon, title, tag, live }: { icon: ReactNode; title: Bi; tag?: string; live?: boolean }) {
  const { b, lang } = useT();
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <div className="row gap-2" style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)' }}>
        <span style={{ color: 'var(--secondary)' }}>{icon}</span>
        {b(title)}
      </div>
      {live ? (
        <span className="mono row gap-2" style={{ fontSize: 10.5, color: 'var(--success)' }}>
          <span className="badge-dot pulse-dot" />
          {lang === 'zh' ? '实时' : 'streaming'}
        </span>
      ) : tag ? (
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{tag}</span>
      ) : null}
    </div>
  );
}

function Mini({ value, label, color }: { value: string; label: Bi; color: string }) {
  const { b } = useT();
  return (
    <div>
      <b className="mono" style={{ display: 'block', fontSize: 17, fontWeight: 700, color }}>{value}</b>
      <span style={{ fontSize: 11, color: 'var(--sub)' }}>{b(label)}</span>
    </div>
  );
}
