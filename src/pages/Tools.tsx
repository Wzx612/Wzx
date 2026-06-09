import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { motion } from 'framer-motion';
import type { Bi } from '@/types';

const CATS: { id: string; label: Bi }[] = [
  { id: 'all', label: { en: 'All', zh: '全部' } },
  { id: 'maps', label: { en: 'Maps', zh: '地图' } },
  { id: 'weather', label: { en: 'Weather', zh: '天气' } },
  { id: 'search', label: { en: 'Search', zh: '搜索引擎' } },
  { id: 'database', label: { en: 'Database', zh: '数据库' } },
  { id: 'crm', label: { en: 'CRM', zh: '客户管理' } },
  { id: 'payment', label: { en: 'Payment', zh: '支付' } },
  { id: 'email', label: { en: 'Email', zh: '邮件' } },
  { id: 'calendar', label: { en: 'Calendar', zh: '日历' } },
  { id: 'analytics', label: { en: 'Analytics', zh: '分析' } },
];

interface Tool {
  cat: string;
  logo?: string;
  icon?: string;
  color: string;
  name: Bi;
  desc: Bi;
  calls: string;
  connected: boolean;
}

const TOOLS: Tool[] = [
  { cat: 'maps', logo: '高', color: '#10B981', name: { en: 'Amap (高德地图)', zh: '高德地图' }, desc: { en: 'Geocoding, commute time, POI & transit access scoring.', zh: '地理编码、通勤时长、POI 与地铁可达性评分。' }, calls: '420k', connected: true },
  { cat: 'maps', logo: '腾', color: '#4F7CFF', name: { en: 'Tencent Maps', zh: '腾讯地图' }, desc: { en: 'Street view, district boundaries, heatmap tiles.', zh: '街景、行政边界、热力图瓦片。' }, calls: '180k', connected: false },
  { cat: 'weather', icon: 'cloud', color: '#00D4FF', name: { en: 'Weather API', zh: '天气服务' }, desc: { en: 'Air quality, climate history for livability scoring.', zh: '空气质量、气候历史，用于宜居评分。' }, calls: '64k', connected: true },
  { cat: 'search', icon: 'search', color: '#7C3AED', name: { en: 'Web Search', zh: '联网搜索' }, desc: { en: 'Live listings & news retrieval across the open web.', zh: '从开放网络检索实时房源与资讯。' }, calls: '512k', connected: true },
  { cat: 'database', icon: 'db', color: '#F59E0B', name: { en: 'PostgreSQL MCP', zh: 'PostgreSQL 数据库' }, desc: { en: 'Query the internal transactions & listings warehouse.', zh: '查询内部成交与房源数据仓库。' }, calls: '890k', connected: true },
  { cat: 'database', logo: '链', color: '#10B981', name: { en: 'Lianjia Data', zh: '链家数据' }, desc: { en: 'Transaction price index & inventory by district.', zh: '分区域成交价指数与库存。' }, calls: '230k', connected: true },
  { cat: 'crm', icon: 'users', color: '#4F7CFF', name: { en: 'Salesforce CRM', zh: 'Salesforce CRM' }, desc: { en: 'Sync client leads, preferences and follow-ups.', zh: '同步客户线索、偏好与跟进记录。' }, calls: '48k', connected: false },
  { cat: 'payment', logo: '支', color: '#1677FF', name: { en: 'Alipay', zh: '支付宝' }, desc: { en: 'Escrow deposits & subscription billing.', zh: '定金托管与订阅计费。' }, calls: '12k', connected: false },
  { cat: 'payment', logo: '微', color: '#10B981', name: { en: 'WeChat Pay', zh: '微信支付' }, desc: { en: 'Mobile payments and refund automation.', zh: '移动支付与退款自动化。' }, calls: '9k', connected: true },
  { cat: 'email', icon: 'mail', color: '#F43F5E', name: { en: 'SMTP Mailer', zh: '邮件服务' }, desc: { en: 'Automated reports & viewing reminders.', zh: '自动化报告与看房提醒。' }, calls: '31k', connected: true },
  { cat: 'calendar', icon: 'calendar', color: '#7C3AED', name: { en: 'Calendar Sync', zh: '日历同步' }, desc: { en: 'Schedule viewings & sync agent availability.', zh: '预约看房并同步顾问日程。' }, calls: '22k', connected: false },
  { cat: 'analytics', icon: 'chart', color: '#00D4FF', name: { en: 'Analytics Engine', zh: '分析引擎' }, desc: { en: 'Event tracking, funnels & cohort analysis.', zh: '事件追踪、漏斗与同期群分析。' }, calls: '156k', connected: true },
];

export default function Tools() {
  const { b, lang } = useT();
  const [activeCat, setActiveCat] = useState('all');
  const [tools, setTools] = useState(TOOLS);
  const [connecting, setConnecting] = useState<number | null>(null);
  const Tool = getIcon('tool');
  const Bolt = getIcon('bolt');

  const visible = tools.filter((t) => activeCat === 'all' || t.cat === activeCat);

  const toggle = (globalIdx: number) => {
    const tool = tools[globalIdx];
    if (tool.connected) {
      setTools((prev) => prev.map((t, i) => (i === globalIdx ? { ...t, connected: false } : t)));
      return;
    }
    setConnecting(globalIdx);
    setTimeout(() => {
      setTools((prev) => prev.map((t, i) => (i === globalIdx ? { ...t, connected: true } : t)));
      setConnecting(null);
    }, 1100);
  };

  return (
    <AppShell title={{ en: 'MCP Tool Center', zh: 'MCP 工具中心' }} crumb="atlas / intelligence / mcp-tools">
      <PageHead
        title={{ en: 'MCP Tool Center', zh: 'MCP 工具中心' }}
        desc={{ en: 'Connect external capabilities to your agents through the Model Context Protocol — maps, data, payments, and more.', zh: '通过 Model Context Protocol 为智能体连接外部能力 —— 地图、数据、支付等。' }}
      />

      {/* hero */}
      <div
        className="row gap-4"
        style={{ padding: '22px 26px', marginBottom: 22, borderRadius: 'var(--r-lg)', background: 'radial-gradient(120% 160% at 100% 0%, rgba(0,212,255,0.14), transparent 55%), var(--surface-1)', border: '1px solid var(--glass-border)' }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--grad-primary)', boxShadow: '0 10px 26px rgba(79,124,255,0.4)', flexShrink: 0 }}>
          <Tool color="#fff" size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: 19, marginBottom: 4 }}>{lang === 'zh' ? '工具市场' : 'Tool Marketplace'}</h2>
          <p style={{ fontSize: 13.5, color: 'var(--sub)' }}>{lang === 'zh' ? '32 个 MCP 服务可用 · 企业认证' : '32 MCP servers available · enterprise-verified'}</p>
        </div>
        <div className="row gap-6" style={{ marginLeft: 'auto' }}>
          {[
            { v: '9', l: { en: 'Connected', zh: '已连接' }, c: 'var(--success)' },
            { v: '1.2M', l: { en: 'Calls / day', zh: '日调用' }, c: 'var(--secondary)' },
            { v: '99.9%', l: { en: 'Uptime', zh: '可用率' }, c: 'var(--text)' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <b className="mono" style={{ fontSize: 22, fontWeight: 700, display: 'block', color: s.c }}>{s.v}</b>
              <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{b(s.l)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* categories */}
      <div className="row gap-2" style={{ marginBottom: 22, flexWrap: 'wrap' }}>
        {CATS.map((c) => {
          const count = c.id === 'all' ? tools.length : tools.filter((t) => t.cat === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={c.id === activeCat ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
              style={{ borderRadius: 'var(--r-pill)', gap: 7 }}
            >
              {b(c.label)}
              <span className="mono" style={{ fontSize: 10.5, opacity: 0.8 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* grid */}
      <div className="grid-base grid-3">
        {visible.map((t, i) => {
          const globalIdx = tools.indexOf(t);
          const Icon = t.icon ? getIcon(t.icon) : null;
          const isConnecting = connecting === globalIdx;
          return (
            <motion.div
              key={t.name.en}
              className="card card-hover"
              style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
            >
              <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: 18, color: '#fff', background: `linear-gradient(135deg,${t.color},${t.color}99)` }}>
                  {t.logo ? t.logo : Icon ? <Icon color="#fff" size={24} /> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 680 }}>{b(t.name)}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    {CATS.find((c) => c.id === t.cat)?.label.en} · MCP
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5, flex: 1, minHeight: 40 }}>{b(t.desc)}</div>
              <div className="row" style={{ justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                <span className="mono row gap-2" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  <Bolt size={13} />
                  {t.calls}/d
                </span>
                <button
                  onClick={() => toggle(globalIdx)}
                  className="badge"
                  style={{
                    cursor: 'pointer',
                    padding: '7px 16px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: t.connected ? 'var(--success)' : isConnecting ? 'var(--secondary)' : 'var(--text)',
                    background: t.connected ? 'rgba(16,185,129,0.12)' : 'var(--surface-2)',
                    borderColor: t.connected ? 'rgba(16,185,129,0.35)' : 'var(--glass-border)',
                  }}
                >
                  {isConnecting ? (lang === 'zh' ? '连接中…' : 'Connecting…') : t.connected ? (lang === 'zh' ? '已连接' : 'Connected') : lang === 'zh' ? '连接' : 'Connect'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </AppShell>
  );
}
