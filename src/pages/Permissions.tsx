import { useMemo, useState, type CSSProperties } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { cn } from '@/lib/format';
import type { Bi } from '@/types';

interface Role { id: string; name: Bi; members: number; color: string; icon: string; level: number }
const ROLES: Role[] = [
  { id: 'super', name: { en: 'Super Admin', zh: '超级管理员' }, members: 2, color: '#F43F5E', icon: 'shield', level: 5 },
  { id: 'admin', name: { en: 'Admin', zh: '管理员' }, members: 12, color: '#4F7CFF', icon: 'shield', level: 4 },
  { id: 'analyst', name: { en: 'Analyst', zh: '分析师' }, members: 34, color: '#00D4FF', icon: 'chart', level: 3 },
  { id: 'operator', name: { en: 'Agent Operator', zh: '智能体操作员' }, members: 56, color: '#7C3AED', icon: 'bot', level: 2 },
  { id: 'viewer', name: { en: 'Viewer', zh: '访客' }, members: 128, color: '#94A3B8', icon: 'search', level: 1 },
];

const MODULES: { name: Bi; desc: Bi; icon: string }[] = [
  { name: { en: 'Dashboard', zh: '仪表盘' }, desc: { en: 'Platform overview', zh: '平台总览' }, icon: 'grid' },
  { name: { en: 'AI Chat', zh: '智能对话' }, desc: { en: 'Run consultations', zh: '发起咨询' }, icon: 'chat' },
  { name: { en: 'Workflows', zh: '工作流' }, desc: { en: 'Build & run flows', zh: '编排与运行' }, icon: 'workflow' },
  { name: { en: 'Knowledge Base', zh: '知识库' }, desc: { en: 'Manage documents', zh: '管理文档' }, icon: 'book' },
  { name: { en: 'MCP Tools', zh: 'MCP 工具' }, desc: { en: 'Connect services', zh: '连接服务' }, icon: 'tool' },
  { name: { en: 'Billing', zh: '计费' }, desc: { en: 'Plans & invoices', zh: '套餐与账单' }, icon: 'card' },
  { name: { en: 'Permissions', zh: '权限' }, desc: { en: 'Manage RBAC', zh: '管理权限' }, icon: 'shield' },
];
const ACTIONS: Bi[] = [
  { en: 'view', zh: '查看' },
  { en: 'create', zh: '创建' },
  { en: 'edit', zh: '编辑' },
  { en: 'delete', zh: '删除' },
  { en: 'export', zh: '导出' },
];

function defaultPerm(level: number, mi: number, action: string): boolean {
  if (level === 5) return true;
  if (level === 4) return action !== 'delete' || mi < 5;
  if (level === 3) return action === 'view' || action === 'export' || (action === 'create' && mi < 4);
  if (level === 2) return action === 'view' || (action === 'create' && (mi === 1 || mi === 2));
  return action === 'view' && mi < 5;
}

const MEMBERS = [
  { name: '陈思远', email: 'chen@atlas.ai', role: 'super', dept: { en: 'Engineering', zh: '工程部' }, color: '#F43F5E', status: 'active' },
  { name: '林婉清', email: 'lin@atlas.ai', role: 'admin', dept: { en: 'Product', zh: '产品部' }, color: '#4F7CFF', status: 'active' },
  { name: '王志强', email: 'wang@atlas.ai', role: 'analyst', dept: { en: 'Research', zh: '研究部' }, color: '#00D4FF', status: 'active' },
  { name: '赵敏', email: 'zhao@atlas.ai', role: 'operator', dept: { en: 'Operations', zh: '运营部' }, color: '#7C3AED', status: 'active' },
  { name: '刘洋', email: 'liu@atlas.ai', role: 'analyst', dept: { en: 'Sales', zh: '销售部' }, color: '#10B981', status: 'away' },
  { name: '黄小蕾', email: 'huang@atlas.ai', role: 'viewer', dept: { en: 'Marketing', zh: '市场部' }, color: '#F59E0B', status: 'offline' },
] as const;

const DEPTS: { name: Bi; count: number; lead: string; color: string }[] = [
  { name: { en: 'Engineering', zh: '工程部' }, count: 24, lead: '陈思远', color: '#4F7CFF' },
  { name: { en: 'Product', zh: '产品部' }, count: 16, lead: '林婉清', color: '#7C3AED' },
  { name: { en: 'Research', zh: '研究部' }, count: 12, lead: '王志强', color: '#00D4FF' },
  { name: { en: 'Operations', zh: '运营部' }, count: 31, lead: '赵敏', color: '#10B981' },
  { name: { en: 'Sales', zh: '销售部' }, count: 48, lead: '刘洋', color: '#F59E0B' },
  { name: { en: 'Marketing', zh: '市场部' }, count: 19, lead: '黄小蕾', color: '#F43F5E' },
];

const STATUS: Record<string, { color: string; label: Bi }> = {
  active: { color: '#10B981', label: { en: 'Active', zh: '在线' } },
  away: { color: '#F59E0B', label: { en: 'Away', zh: '离开' } },
  offline: { color: '#64748B', label: { en: 'Offline', zh: '离线' } },
};

const TABS: { id: string; label: Bi }[] = [
  { id: 'matrix', label: { en: 'Permission Matrix', zh: '权限矩阵' } },
  { id: 'members', label: { en: 'Members', zh: '成员' } },
  { id: 'depts', label: { en: 'Departments', zh: '部门' } },
];

export default function Permissions() {
  const { b, lang } = useT();
  const [tab, setTab] = useState('matrix');
  const [selRole, setSelRole] = useState(ROLES[1]);
  const [state, setState] = useState<Record<string, boolean[][]>>(() => {
    const init: Record<string, boolean[][]> = {};
    ROLES.forEach((r) => {
      init[r.id] = MODULES.map((_, mi) => ACTIONS.map((a) => defaultPerm(r.level, mi, a.en)));
    });
    return init;
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    ROLES.forEach((r) => {
      c[r.id] = state[r.id].reduce((acc, row) => acc + row.filter(Boolean).length, 0);
    });
    return c;
  }, [state]);
  const total = MODULES.length * ACTIONS.length;

  const toggle = (mi: number, ai: number) =>
    setState((prev) => {
      const next = { ...prev, [selRole.id]: prev[selRole.id].map((row) => [...row]) };
      next[selRole.id][mi][ai] = !next[selRole.id][mi][ai];
      return next;
    });

  return (
    <AppShell title={{ en: 'Permission Center', zh: '权限中心' }} crumb="atlas / operations / permissions">
      <PageHead
        title={{ en: 'Permission Center', zh: '权限中心' }}
        desc={{ en: 'Role-based access control across every module, action, and department.', zh: '覆盖所有模块、操作与部门的基于角色的访问控制（RBAC）。' }}
      />

      <div className="row gap-2" style={{ padding: 5, background: 'var(--surface-1)', borderRadius: 'var(--r-sm)', marginBottom: 22, border: '1px solid var(--glass-border)', width: 'fit-content' }}>
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: tab === t.id ? 'var(--text)' : 'var(--sub)', background: tab === t.id ? 'var(--surface-3)' : 'transparent' }}
          >
            {b(t.label)}
          </div>
        ))}
      </div>

      {tab === 'matrix' && (
        <>
          <div className="grid-base grid-4" style={{ marginBottom: 26, gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {ROLES.map((r) => {
              const Icon = getIcon(r.icon);
              return (
                <div
                  key={r.id}
                  className="card"
                  onClick={() => setSelRole(r)}
                  style={{ padding: 16, cursor: 'pointer', border: selRole.id === r.id ? '1px solid var(--primary)' : '1px solid var(--glass-border)', boxShadow: selRole.id === r.id ? '0 0 0 2px rgba(79,124,255,0.3)' : undefined }}
                >
                  <div className="row gap-3" style={{ marginBottom: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${r.color},${r.color}99)` }}>
                      <Icon color="#fff" size={17} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 650 }}>{b(r.name)}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{r.members} {lang === 'zh' ? '成员' : 'members'}</div>
                    </div>
                  </div>
                  <div className="mono row" style={{ fontSize: 11, color: 'var(--sub)', justifyContent: 'space-between' }}>
                    <span>{lang === 'zh' ? '权限' : 'Permissions'}</span>
                    <b style={{ color: 'var(--secondary)' }}>{counts[r.id]}/{total}</b>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="row" style={{ padding: '16px 18px', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 650, fontSize: 15 }}>{b(selRole.name)}</span>{' '}
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>· {selRole.members} {lang === 'zh' ? '成员' : 'members'}</span>
              </div>
              <button className="btn btn-sm btn-primary">{lang === 'zh' ? '保存修改' : 'Save Changes'}</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="mono" style={thStyle}>{lang === 'zh' ? '模块' : 'Module'}</th>
                    {ACTIONS.map((a) => (
                      <th key={a.en} className="mono" style={{ ...thStyle, textAlign: 'center', width: 90 }}>{b(a)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m, mi) => {
                    const Icon = getIcon(m.icon);
                    return (
                      <tr key={m.name.en}>
                        <td style={tdStyle}>
                          <div className="row gap-3">
                            <div style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: selRole.color }}>
                              <Icon size={15} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{b(m.name)}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{b(m.desc)}</div>
                            </div>
                          </div>
                        </td>
                        {ACTIONS.map((a, ai) => (
                          <td key={a.en} style={{ ...tdStyle, textAlign: 'center' }}>
                            <Toggle on={state[selRole.id][mi][ai]} onClick={() => toggle(mi, ai)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="row gap-3" style={{ padding: 16, borderRadius: 'var(--r-sm)', background: 'var(--surface-1)', border: '1px dashed var(--glass-border-strong)', marginTop: 16, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{lang === 'zh' ? '按钮级权限 →' : 'Button-level control →'}</span>
            {[
              { label: { en: 'View', zh: '查看' }, locked: false },
              { label: { en: 'Edit', zh: '编辑' }, locked: false },
              { label: { en: 'Delete', zh: '删除' }, locked: true },
              { label: { en: 'Export', zh: '导出' }, locked: true },
            ].map((btn, i) => (
              <button key={i} className="btn btn-sm btn-ghost" style={{ opacity: btn.locked ? 0.35 : 1 }} disabled={btn.locked}>
                {b(btn.label)} {btn.locked ? '🔒' : ''}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'members' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[{ en: 'Member', zh: '成员' }, { en: 'Role', zh: '角色' }, { en: 'Department', zh: '部门' }, { en: 'Status', zh: '状态' }].map((h) => (
                  <th key={h.en} className="mono" style={thStyle}>{b(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEMBERS.map((m) => {
                const role = ROLES.find((r) => r.id === m.role)!;
                const st = STATUS[m.status];
                return (
                  <tr key={m.email}>
                    <td style={tdStyle}>
                      <div className="row gap-3">
                        <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0, background: `linear-gradient(135deg,${m.color},${m.color}99)` }}>{m.name[0]}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{m.name}</div>
                          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span className="badge" style={{ background: `${role.color}22`, color: role.color, borderColor: 'transparent' }}>{b(role.name)}</span>
                    </td>
                    <td style={tdStyle}>{b(m.dept)}</td>
                    <td style={tdStyle}>
                      <span className="badge" style={{ color: st.color, borderColor: 'transparent', background: 'var(--surface-2)' }}>
                        <span className="badge-dot" />{b(st.label)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'depts' && (
        <div className="grid-base grid-3">
          {DEPTS.map((d) => {
            const Bank = getIcon('bank');
            return (
              <div key={d.name.en} className="card card-hover" style={{ padding: 18 }}>
                <div className="row gap-3" style={{ marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${d.color},${d.color}99)` }}>
                    <Bank color="#fff" size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 15 }}>{b(d.name)}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{lang === 'zh' ? '负责人' : 'Lead'}: {d.lead}</div>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="text-sub" style={{ fontSize: 13 }}>{lang === 'zh' ? '成员数' : 'Members'}</span>
                  <b className="mono" style={{ color: d.color, fontSize: 20 }}>{d.count}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '12px 16px',
  borderBottom: '1px solid var(--glass-border)',
};
const tdStyle: CSSProperties = {
  padding: '13px 16px',
  borderBottom: '1px solid var(--glass-border)',
  fontSize: 13.5,
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('atlas-toggle')}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? 'var(--grad-primary)' : 'var(--surface-3)', position: 'relative', cursor: 'pointer', margin: '0 auto' }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  );
}
