import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { cn } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { Bi } from '@/types';

const NAV: { id: string; label: Bi; icon: string }[] = [
  { id: 'profile', label: { en: 'Profile', zh: '个人资料' }, icon: 'users' },
  { id: 'appearance', label: { en: 'Appearance', zh: '外观' }, icon: 'sun' },
  { id: 'security', label: { en: 'Security', zh: '安全' }, icon: 'shield' },
  { id: 'integrations', label: { en: 'SSO & OAuth', zh: 'SSO 与 OAuth' }, icon: 'tool' },
  { id: 'billing', label: { en: 'Billing', zh: '计费' }, icon: 'card' },
  { id: 'notifications', label: { en: 'Notifications', zh: '通知' }, icon: 'bell' },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 42, height: 24, borderRadius: 999, background: on ? 'var(--grad-primary)' : 'var(--surface-3)', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  );
}

function Field({ label, sub, defaultOn }: { label: Bi; sub: Bi; defaultOn: boolean }) {
  const { b } = useT();
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--glass-border)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{b(label)}</div>
        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 2 }}>{b(sub)}</div>
      </div>
      <Toggle on={on} onClick={() => setOn(!on)} />
    </div>
  );
}

export default function Settings() {
  const { b, lang } = useT();
  const [active, setActive] = useState('appearance');
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLang = useUiStore((s) => s.setLang);
  const authUser = useAuthStore((s) => s.user);

  /* Profile values — prefer live auth data, fall back to demo defaults. */
  const avatarLetter  = authUser?.avatar ?? authUser?.name?.charAt(0) ?? '用';
  const fullName      = authUser?.name   ?? '陈思远';
  const displayName   = authUser ? authUser.name : 'Siyuan Chen';
  const account       = authUser?.username ?? 'admin';
  const role          = authUser?.role   ?? (lang === 'zh' ? '企业管理员' : 'Enterprise Admin');
  /* AuthUser has no email field; derive a display value from the username. */
  const email         = authUser ? `${authUser.username}@atlas.ai` : 'chen@atlas.ai';

  return (
    <AppShell title={{ en: 'Settings', zh: '设置中心' }} crumb="atlas / operations / settings">
      <PageHead
        title={{ en: 'Settings', zh: '设置中心' }}
        desc={{ en: 'Manage your profile, appearance, security, integrations, and billing.', zh: '管理个人资料、外观、安全、集成与计费。' }}
      />

      <div className="grid-base" style={{ gridTemplateColumns: '220px 1fr', gap: 28, alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 90, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map((n) => {
            const Icon = getIcon(n.icon);
            return (
              <div
                key={n.id}
                className="row gap-3"
                onClick={() => setActive(n.id)}
                style={{ padding: '10px 13px', borderRadius: 'var(--r-sm)', fontSize: 14, fontWeight: 550, cursor: 'pointer', color: active === n.id ? 'var(--text)' : 'var(--sub)', background: active === n.id ? 'var(--surface-3)' : 'transparent' }}
              >
                <Icon size={17} />
                {b(n.label)}
              </div>
            );
          })}
        </nav>

        <div style={{ maxWidth: 720 }}>
          {active === 'profile' && (
            <div className="card" style={{ padding: 22 }}>
              <div className="row gap-4" style={{ marginBottom: 22 }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--grad-accent)', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700, color: '#fff' }}>
                  {avatarLetter}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{fullName}</h3>
                  <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 2 }}>{email} · {role}</div>
                </div>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }}>{lang === 'zh' ? '更换头像' : 'Change avatar'}</button>
              </div>
              <div className="grid-base grid-2" style={{ marginBottom: 14 }}>
                <Input label={{ en: 'Full name', zh: '姓名' }} value={fullName} />
                <Input label={{ en: 'Display name', zh: '显示名' }} value={displayName} />
              </div>
              <div className="grid-base grid-2">
                <Input label={{ en: 'Email', zh: '邮箱' }} value={email} />
                <Input label={{ en: 'Account', zh: '账号' }} value={account} />
              </div>
              <button className="btn btn-primary" style={{ marginTop: 18 }}>{lang === 'zh' ? '保存资料' : 'Save profile'}</button>
            </div>
          )}

          {active === 'appearance' && (
            <>
              <div className="card" style={{ padding: 22, marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '主题' : 'Theme'}</h3>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 18 }}>{lang === 'zh' ? '选择 Atlas 的外观，立即生效。' : 'Choose how Atlas looks. Applies instantly.'}</div>
                <div className="grid-base grid-2">
                  {(['dark', 'light'] as const).map((tm) => (
                    <div
                      key={tm}
                      onClick={() => setTheme(tm)}
                      style={{ padding: 6, borderRadius: 'var(--r)', border: `2px solid ${theme === tm ? 'var(--primary)' : 'var(--glass-border)'}`, cursor: 'pointer' }}
                    >
                      <div style={{ height: 92, borderRadius: 11, overflow: 'hidden', display: 'flex', background: tm === 'dark' ? '#0B1020' : '#F4F6FB' }}>
                        <div style={{ width: '30%', background: tm === 'dark' ? 'rgba(255,255,255,0.04)' : '#fff' }} />
                        <div style={{ flex: 1, padding: 8 }}>
                          <div style={{ height: 8, borderRadius: 3, marginBottom: 6, background: '#4F7CFF', width: '70%' }} />
                          <div style={{ height: 8, borderRadius: 3, marginBottom: 6, background: tm === 'dark' ? 'rgba(255,255,255,0.1)' : '#dde3ee' }} />
                          <div style={{ height: 8, borderRadius: 3, background: tm === 'dark' ? 'rgba(255,255,255,0.1)' : '#dde3ee', width: '80%' }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '9px 0 4px' }}>
                        {tm === 'dark' ? (lang === 'zh' ? '深色' : 'Dark') : lang === 'zh' ? '浅色' : 'Light'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 22, marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '语言' : 'Language'}</h3>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 18 }}>{lang === 'zh' ? '平台界面语言。' : 'Interface language across the platform.'}</div>
                <div className="row" style={{ padding: 3, background: 'var(--surface-3)', borderRadius: 'var(--r-sm)', width: 'fit-content' }}>
                  {(['zh', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={cn(lang === l && 'btn-primary')}
                      style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: lang === l ? 'var(--grad-primary)' : 'transparent', color: lang === l ? '#fff' : 'var(--sub)' }}
                    >
                      {l === 'zh' ? '中文' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '显示' : 'Display'}</h3>
                <Field label={{ en: 'Reduce motion', zh: '减少动效' }} sub={{ en: 'Minimize animations & particles', zh: '减少动画与粒子效果' }} defaultOn={false} />
                <Field label={{ en: 'Compact density', zh: '紧凑布局' }} sub={{ en: 'Tighter spacing in tables & lists', zh: '表格与列表更紧凑' }} defaultOn={false} />
                <Field label={{ en: 'Show agent avatars', zh: '显示智能体头像' }} sub={{ en: 'Render avatars in chat & lists', zh: '在对话与列表中显示头像' }} defaultOn />
              </div>
            </>
          )}

          {active === 'security' && (
            <>
              <div className="card" style={{ padding: 22, marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '身份认证' : 'Authentication'}</h3>
                <Field label={{ en: 'Two-factor authentication', zh: '双因素认证' }} sub={{ en: 'Require a code on every login', zh: '每次登录需验证码' }} defaultOn />
                <Field label={{ en: 'Biometric login', zh: '生物识别登录' }} sub={{ en: 'Face ID / fingerprint on mobile', zh: '移动端人脸 / 指纹' }} defaultOn />
                <Field label={{ en: 'Session timeout', zh: '会话超时' }} sub={{ en: 'Auto sign-out after 30 min idle', zh: '闲置 30 分钟自动登出' }} defaultOn={false} />
              </div>
              <div className="card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '活跃会话' : 'Active Sessions'}</h3>
                {['MacBook Pro · Beijing', 'iPhone 16 · Shanghai', 'Chrome · Windows'].map((d, i) => (
                  <div key={d} className="row" style={{ justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--glass-border)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{d}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 2 }}>{i === 0 ? (lang === 'zh' ? '当前会话' : 'Current session') : lang === 'zh' ? '2 小时前活跃' : 'Last active 2h ago'}</div>
                    </div>
                    {i === 0 ? <span className="badge badge-success">{lang === 'zh' ? '本设备' : 'This device'}</span> : <button className="btn btn-sm btn-ghost">{lang === 'zh' ? '撤销' : 'Revoke'}</button>}
                  </div>
                ))}
              </div>
            </>
          )}

          {active === 'integrations' && (
            <div className="card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '单点登录' : 'Single Sign-On'}</h3>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 18 }}>{lang === 'zh' ? '连接身份提供商以启用企业级 SSO 与 OAuth。' : 'Connect identity providers for enterprise SSO & OAuth.'}</div>
              {[
                { logo: 'G', color: '#EA4335', name: 'Google Workspace', sub: { en: 'SSO · SAML 2.0', zh: '单点登录 · SAML 2.0' }, on: true },
                { logo: '飞', color: '#00D6B9', name: 'Feishu / Lark', sub: { en: 'OAuth 2.0', zh: 'OAuth 2.0' }, on: true },
                { logo: '企', color: '#4F7CFF', name: 'WeCom (企业微信)', sub: { en: 'OAuth · scan login', zh: 'OAuth · 扫码登录' }, on: false },
                { logo: 'M', color: '#5E5CE6', name: 'Microsoft Entra ID', sub: { en: 'SSO · OIDC', zh: '单点登录 · OIDC' }, on: false },
              ].map((c) => (
                <div key={c.name} className="row gap-3" style={{ padding: '14px 0', borderTop: '1px solid var(--glass-border)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 700, color: '#fff', flexShrink: 0, background: c.color }}>{c.logo}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{b(c.sub)}</div>
                  </div>
                  <button className={c.on ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-primary'}>{c.on ? (lang === 'zh' ? '已连接' : 'Connected') : lang === 'zh' ? '连接' : 'Connect'}</button>
                </div>
              ))}
            </div>
          )}

          {active === 'billing' && (
            <>
              <div className="row gap-4" style={{ padding: 22, borderRadius: 'var(--r-lg)', background: 'radial-gradient(120% 160% at 100% 0%, rgba(124,58,237,0.2), transparent 55%), var(--surface-1)', border: '1px solid var(--glass-border-strong)', marginBottom: 18 }}>
                <div>
                  <div className="row gap-3" style={{ marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: 11, padding: '5px 12px', borderRadius: 'var(--r-pill)', background: 'var(--grad-iris)', color: '#fff', fontWeight: 700 }}>ENTERPRISE</span>
                    <span className="badge badge-success"><span className="badge-dot" />{lang === 'zh' ? '生效中' : 'Active'}</span>
                  </div>
                  <h3 style={{ fontSize: 20, margin: 0 }}>{lang === 'zh' ? '企业版' : 'Enterprise Plan'}</h3>
                  <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 4 }}>{lang === 'zh' ? '无限智能体 · 每月 5000 万 Token · 优先支持' : 'Unlimited agents · 50M tokens/mo · priority support'}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 30, fontWeight: 700 }}>¥4,999<span style={{ fontSize: 14, color: 'var(--sub)' }}>/mo</span></div>
                  <button className="btn btn-primary btn-sm mt-2">{lang === 'zh' ? '管理套餐' : 'Manage plan'}</button>
                </div>
              </div>
              <div className="card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '本月用量' : 'Usage this month'}</h3>
                {([
                  [{ en: 'Tokens', zh: 'Token' }, '42.8M / 50M', 86, '#4F7CFF'],
                  [{ en: 'Agent runs', zh: '智能体执行' }, '153.9k / 200k', 77, '#00D4FF'],
                  [{ en: 'Storage', zh: '存储' }, '14.2 / 50 GB', 28, '#10B981'],
                ] as [Bi, string, number, string][]).map(([label, v, p, c]) => (
                  <div key={label.en} style={{ padding: '12px 0', borderTop: '1px solid var(--glass-border)' }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{b(label)}</span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--sub)' }}>{v}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p}%`, background: c, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {active === 'notifications' && (
            <>
              <div className="card" style={{ padding: 22, marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '通知中心' : 'Notification Center'}</h3>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 18 }}>{lang === 'zh' ? '选择需要接收的通知类型。' : 'Choose what you get notified about.'}</div>
                <Field label={{ en: 'Agent run completed', zh: '智能体执行完成' }} sub={{ en: 'When a workflow finishes', zh: '工作流执行结束时' }} defaultOn />
                <Field label={{ en: 'New market signals', zh: '新市场信号' }} sub={{ en: 'Price alerts on watched districts', zh: '关注区域价格预警' }} defaultOn />
                <Field label={{ en: 'Knowledge base updates', zh: '知识库更新' }} sub={{ en: 'When documents finish embedding', zh: '文档向量化完成时' }} defaultOn={false} />
                <Field label={{ en: 'Quota warnings', zh: '额度提醒' }} sub={{ en: 'At 80% of monthly token usage', zh: '达到月度 Token 用量 80% 时' }} defaultOn />
              </div>
              <div className="card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{lang === 'zh' ? '推送渠道' : 'Delivery channels'}</h3>
                <Field label={{ en: 'Email', zh: '邮件' }} sub={{ en: 'chen@atlas.ai', zh: 'chen@atlas.ai' }} defaultOn />
                <Field label={{ en: 'In-app', zh: '站内' }} sub={{ en: 'Bell icon notifications', zh: '铃铛图标通知' }} defaultOn />
                <Field label={{ en: 'Feishu / Lark', zh: '飞书' }} sub={{ en: 'Push to your Lark account', zh: '推送至飞书账号' }} defaultOn />
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Input({ label, value }: { label: Bi; value: string }) {
  const { b } = useT();
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>{b(label)}</label>
      <input
        defaultValue={value}
        style={{ width: '100%', padding: '10px 13px', borderRadius: 'var(--r-sm)', background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--font-sans)' }}
      />
    </div>
  );
}
