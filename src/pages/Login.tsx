
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { useAuthStore } from '@/store/authStore';

/**
 * Standalone login page (no AppShell). Username + password against the real
 * /api/auth/login endpoint; on success the dual-token pair is stored and the
 * user is sent to the page they originally requested.
 */
export default function Login() {
  const { lang } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // Already signed in → bounce to the intended destination.
  if (status === 'authed') return <Navigate to={from} replace />;

  const User = getIcon('users');
  const Lock = getIcon('shield');
  const Spark = getIcon('sparkle');
  const Loader = getIcon('loader');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message || (lang === 'zh' ? '登录失败' : 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <div style={backdrop} aria-hidden />
      <form className="card" style={panel} onSubmit={onSubmit}>
        <div className="row gap-3" style={{ alignItems: 'center', marginBottom: 22 }}>
          <div style={brandMark}>
            <Spark size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 720, letterSpacing: 0.2 }}>Atlas</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
              {lang === 'zh' ? 'AI 多智能体房产顾问平台' : 'AI Multi-Agent Real Estate Advisor'}
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 16, marginBottom: 3 }}>
          {lang === 'zh' ? '登录' : 'Sign in'}
        </h2>
        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginBottom: 20 }}>
          {lang === 'zh' ? '请使用账号与密码登录' : 'Use your account and password'}
        </div>

        <label style={lbl}>{lang === 'zh' ? '账号' : 'Username'}</label>
        <div className="row gap-2" style={{ ...field, marginBottom: 14 }}>
          <User size={16} color="var(--sub)" />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={lang === 'zh' ? '请输入账号' : 'Enter username'}
            autoComplete="username"
            autoFocus
            style={input}
          />
        </div>

        <label style={lbl}>{lang === 'zh' ? '密码' : 'Password'}</label>
        <div className="row gap-2" style={{ ...field, marginBottom: 18 }}>
          <Lock size={16} color="var(--sub)" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={lang === 'zh' ? '请输入密码' : 'Enter password'}
            type="password"
            autoComplete="current-password"
            style={input}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 14 }}>{error}</div>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy || !username.trim() || !password}
        >
          {busy ? (
            <>
              <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
              {lang === 'zh' ? '登录中…' : 'Signing in…'}
            </>
          ) : (
            lang === 'zh' ? '登录' : 'Sign in'
          )}
        </button>

        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16, textAlign: 'center' }}>
          {lang === 'zh' ? '双 Token · 单点登录 · JWT 鉴权' : 'Dual-token · SSO · JWT'}
        </div>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'var(--bg, #0a0c12)',
  overflow: 'hidden',
};
const backdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(1100px 600px at 18% -10%, rgba(79,124,255,0.20), transparent 60%),' +
    'radial-gradient(900px 520px at 110% 120%, rgba(124,58,237,0.18), transparent 60%)',
  pointerEvents: 'none',
};
const panel: React.CSSProperties = {
  position: 'relative',
  width: 'min(420px, 100%)',
  padding: 30,
};
const brandMark: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 13,
  background: 'var(--grad-accent, linear-gradient(135deg,#4F7CFF,#7C3AED))',
  display: 'grid',
  placeItems: 'center',
};
const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--sub)',
  marginBottom: 6,
  fontWeight: 600,
};
const field: React.CSSProperties = {
  padding: '11px 13px',
  borderRadius: 'var(--r-sm, 10px)',
  background: 'var(--surface-1)',
  border: '1px solid var(--glass-border)',
};
const input: React.CSSProperties = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  width: '100%',
};
