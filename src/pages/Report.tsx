import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import AgentWorkflow from '@/components/agents/AgentWorkflow';
import ReportPanel from '@/components/report/ReportPanel';
import Skeleton from '@/components/ui/Skeleton';
import { useT } from '@/lib/useT';
import { useAgentStore } from '@/store/agentStore';
import { agentService } from '@/services/agentService';
import type { FinalReport } from '@/types';

export default function Report() {
  const { lang } = useT();
  const reportReady = useAgentStore((s) => s.reportReady);
  const running = useAgentStore((s) => s.running);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (reportReady && !report && !fetching) {
      setFetching(true);
      agentService.getReport().then((r) => {
        setReport(r);
        setFetching(false);
      });
    }
    if (!reportReady) setReport(null);
  }, [reportReady, report, fetching]);

  return (
    <AppShell title={{ en: 'AI Report', zh: 'AI 报告' }} crumb="atlas / intelligence / report">
      <PageHead
        title={{ en: 'Final Report', zh: '最终报告' }}
        desc={{
          en: 'Run the multi-agent pipeline. The Coordinator aggregates every result into a grounded purchase recommendation.',
          zh: '运行多智能体管线，协调智能体将汇总所有结果，输出有据可依的购房建议。',
        }}
      />

      <div className="grid-base" style={{ gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <AgentWorkflow />

        <div>
          <AnimatePresence mode="wait">
            {report ? (
              <ReportPanel key="report" report={report} />
            ) : fetching || running ? (
              <motion.div
                key="loading"
                className="card"
                style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Skeleton style={{ height: 44, width: '60%' }} />
                <Skeleton style={{ height: 90 }} />
                <Skeleton style={{ height: 18, width: '40%' }} />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} style={{ height: 14 }} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="card"
                style={{
                  padding: 48,
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 360,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  style={{
                    width: 66,
                    height: 66,
                    borderRadius: 18,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--grad-iris)',
                    marginBottom: 18,
                    boxShadow: '0 14px 36px rgba(124,58,237,0.4)',
                  }}
                >
                  <svg viewBox="0 0 24 24" width="30" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10z" />
                  </svg>
                </div>
                <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 8 }}>
                  {lang === 'zh' ? '尚未生成报告' : 'No report yet'}
                </div>
                <p style={{ fontSize: 14, color: 'var(--sub)', maxWidth: 320 }}>
                  {lang === 'zh'
                    ? '点击左侧「运行工作流」，五个智能体将顺序执行并生成综合购房报告。'
                    : 'Click “Run Workflow” on the left — the five agents will execute in sequence and synthesise a final report.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AppShell>
  );
}
