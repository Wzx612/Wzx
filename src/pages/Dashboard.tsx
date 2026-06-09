import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import ParticleField from '@/components/layout/ParticleField';
import MetricCard from '@/components/agents/MetricCard';
import AgentCard from '@/components/agents/AgentCard';
import CollaborationGraph from '@/components/agents/CollaborationGraph';
import { SectionHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { useAgentStore } from '@/store/agentStore';
import { useChatStore } from '@/store/chatStore';
import { useKnowledgeStore } from '@/store/knowledgeStore';
import { fetchDashboardMetrics, overlaySession } from '@/services/metricsService';
import { METRICS } from '@/mock/analytics';
import { AGENTS } from '@/mock/agents';
import type { Metric } from '@/types';

const MODELS = [
  { name: 'GPT-5', color: '#10B981' },
  { name: 'Claude', color: '#D97757' },
  { name: 'Gemini', color: '#4F7CFF' },
  { name: 'DeepSeek', color: '#00D4FF' },
];

export default function Dashboard() {
  const { lang, t } = useT();
  const navigate = useNavigate();
  const Chat = getIcon('chat');
  const Wf = getIcon('workflow');
  const Sparkle = getIcon('sparkle');

  /* ── Live store reads ──────────────────────────────────── */
  const runtimes     = useAgentStore((s) => s.runtimes);
  const reportReady  = useAgentStore((s) => s.reportReady);
  const chatSessions = useChatStore((s) => s.sessions);
  const kbDocs       = useKnowledgeStore((s) => s.docs);

  /* ── Dashboard metrics (backend or mock + session overlay) */
  const [metrics, setMetrics] = useState<Metric[]>(METRICS);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchDashboardMetrics().then((base) => {
        if (!active) return;
        setMetrics(
          overlaySession(base, {
            chatSessions: chatSessions.length,
            kbDocs: kbDocs.length,
            agentRuns: Object.values(runtimes).filter((r) => r.status === 'completed').length,
          }),
        );
      });
    void load();
    /* Poll every 30 s when a backend is configured */
    const id = setInterval(load, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [chatSessions.length, kbDocs.length, runtimes]);

  return (
    <AppShell
      title={{ en: 'Dashboard', zh: '仪表盘' }}
      crumb="atlas / workspace / dashboard"
    >
      {/* ===== HERO ===== */}
      <motion.section
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--r-xl)',
          padding: '52px 48px',
          border: '1px solid var(--glass-border)',
          background:
            'radial-gradient(120% 140% at 80% 0%, rgba(124,58,237,0.22), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(0,212,255,0.14), transparent 50%), linear-gradient(135deg, rgba(20,28,52,0.85), rgba(11,16,32,0.7))',
          boxShadow: 'var(--shadow-lg)',
          marginBottom: 28,
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <ParticleField count={70} link={150} />

        {/* hero grid overlay */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            opacity: 0.4,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            WebkitMaskImage: 'radial-gradient(80% 80% at 50% 30%, #000, transparent 90%)',
            maskImage: 'radial-gradient(80% 80% at 50% 30%, #000, transparent 90%)',
          }}
        />

        {/* orbit */}
        <svg
          viewBox="0 0 420 420"
          style={{
            position: 'absolute',
            right: -60,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 420,
            height: 420,
            zIndex: 1,
            pointerEvents: 'none',
            opacity: 0.9,
          }}
          aria-hidden
        >
          {[80, 130, 185].map((r) => (
            <circle key={r} cx="210" cy="210" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          ))}
          <g style={{ filter: 'drop-shadow(0 0 30px rgba(79,124,255,0.7))' }}>
            <circle cx="210" cy="210" r="30" fill="url(#core-grad)" />
          </g>
          <g style={{ transformOrigin: '210px 210px', animation: 'spin 24s linear infinite' }}>
            <circle cx="290" cy="210" r="6" fill="#00D4FF" />
            <circle cx="210" cy="80" r="5" fill="#7C3AED" />
          </g>
          <g style={{ transformOrigin: '210px 210px', animation: 'spin 36s linear infinite reverse' }}>
            <circle cx="380" cy="210" r="5" fill="#4F7CFF" />
            <circle cx="80" cy="270" r="4" fill="#00D4FF" />
          </g>
          <defs>
            <radialGradient id="core-grad">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="55%" stopColor="#4F7CFF" />
              <stop offset="100%" stopColor="#7C3AED" />
            </radialGradient>
          </defs>
        </svg>

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 720 }}>
          <span
            className="badge"
            style={{
              marginBottom: 22,
              color: 'var(--secondary)',
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'var(--glass-border-strong)',
            }}
          >
            <span className="badge-dot pulse-dot" />
            {lang === 'zh' ? '12 个智能体在线 · 系统运行正常' : '12 agents online · all systems operational'}
          </span>
          <h1 style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.04, marginBottom: 16 }}>
            <span>{lang === 'zh' ? '多智能体' : 'AI Multi-Agent'}</span>{' '}
            <span className="gradient-text">{lang === 'zh' ? '房产决策顾问' : 'Real Estate Advisor'}</span>
          </h1>
          <p style={{ fontSize: 17, color: 'var(--sub)', lineHeight: 1.55, marginBottom: 14, maxWidth: 560 }}>
            {lang === 'zh'
              ? '企业级智能体操作平台：专业智能体协同规划、检索与推理，把每一个购房问题转化为有据可依的决策。'
              : 'An enterprise operating platform where specialized agents plan, research, and reason together — turning property questions into grounded, cited decisions.'}
          </p>

          <div className="row gap-3" style={{ marginBottom: 30, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--sub)' }}>
              {lang === 'zh' ? '模型驱动' : 'Powered by'}
            </span>
            {MODELS.map((m) => (
              <span
                key={m.name}
                className="mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  color: 'var(--text)',
                  padding: '5px 11px',
                  borderRadius: 'var(--r-pill)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color }} />
                {m.name}
              </span>
            ))}
          </div>

          <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/chat" style={{ padding: '13px 22px', fontSize: 15 }}>
              <Chat size={17} />
              {lang === 'zh' ? '开始咨询' : 'Start Consultation'}
            </Link>
            <Link className="btn btn-ghost" to="/workflow" style={{ padding: '13px 22px', fontSize: 15 }}>
              <Wf size={17} />
              {lang === 'zh' ? '创建智能体工作流' : 'Create Agent Workflow'}
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ===== METRICS ===== */}
      <SectionHead
        title={{ en: 'Realtime Metrics', zh: '实时指标' }}
        sub={{ en: 'Live platform activity across all workspaces', zh: '覆盖全部工作区的平台实时活动' }}
        actions={
          <span className="badge badge-success">
            <span className="badge-dot pulse-dot" />
            {t('common.live')}
          </span>
        }
      />
      {/* Recent workflow result banner */}
      {reportReady && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/report')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            marginBottom: 18, borderRadius: 'var(--r)',
            background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)',
            cursor: 'pointer',
          }}
        >
          <Sparkle size={18} color="#10B981" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            {lang === 'zh' ? '工作流已完成 · 协调智能体生成综合报告' : 'Workflow complete · Coordinator synthesised the final report'}
          </span>
          <span className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto', color: 'var(--success)', borderColor: 'rgba(16,185,129,0.35)' }}>
            {lang === 'zh' ? '查看报告 →' : 'View report →'}
          </span>
        </motion.div>
      )}

      {/* Session stats strip */}
      {(chatSessions.length > 0 || kbDocs.length > 0) && (
        <div className="row gap-3" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {lang === 'zh' ? '本次会话：' : 'This session:'}
          </span>
          {chatSessions.length > 0 && (
            <span className="badge" style={{ color: 'var(--secondary)', borderColor: 'rgba(0,212,255,0.3)' }}>
              {chatSessions.length} {lang === 'zh' ? '次对话' : 'chats'}
            </span>
          )}
          {kbDocs.length > 0 && (
            <span className="badge" style={{ color: 'var(--success)', borderColor: 'rgba(16,185,129,0.3)' }}>
              {kbDocs.length} {lang === 'zh' ? '份知识库文档' : 'KB docs'}
            </span>
          )}
          {Object.values(runtimes).some((r) => r.status === 'completed') && (
            <span className="badge" style={{ color: 'var(--primary)', borderColor: 'rgba(79,124,255,0.3)' }}>
              {Object.values(runtimes).filter((r) => r.status === 'completed').length} {lang === 'zh' ? '个智能体已执行' : 'agents ran'}
            </span>
          )}
        </div>
      )}

      <div className="grid-base grid-3" style={{ marginBottom: 36 }}>
        {metrics.map((m, i) => (
          <MetricCard key={m.label.en} metric={m} index={i} />
        ))}
      </div>

      {/* ===== AGENT CENTER ===== */}
      <SectionHead
        title={{ en: 'Agent Center', zh: '智能体中心' }}
        sub={{ en: '10 specialized agents ready to run', zh: '10 个专业智能体随时待命' }}
        actions={
          <div className="section-actions">
            <button className="btn btn-sm btn-ghost">{t('common.filter')}</button>
            <Link className="btn btn-sm btn-primary" to="/workflow">
              {lang === 'zh' ? '+ 新建智能体' : '+ New Agent'}
            </Link>
          </div>
        }
      />
      <div className="grid-base grid-4" style={{ marginBottom: 36 }}>
        {AGENTS.map((a, i) => (
          <AgentCard
            key={a.id}
            agent={a}
            index={i}
            runtimeStatus={runtimes[a.id]?.status}
          />
        ))}
      </div>

      {/* ===== COLLABORATION GRAPH ===== */}
      <SectionHead
        title={{ en: 'Agent Collaboration', zh: '智能体协同' }}
        sub={{ en: 'How a single query flows through the orchestration pipeline', zh: '一次查询如何流经编排管线' }}
        actions={<span className="badge badge-accent mono">orchestrator · v2.4</span>}
      />
      <CollaborationGraph />
    </AppShell>
  );
}
