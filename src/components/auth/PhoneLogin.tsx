import { useEffect, useRef, useState } from 'react';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { useAuthStore } from '@/store/authStore';
import { sendSms } from '@/services/authService';
import type { SsoProvider } from '@/types';

const SSO: { id: SsoProvider; label: string; logo: string; color: string }[] = [
  { id: 'google', label: 'Google', logo: 'G', color: '#EA4335' },
  { id: 'feishu', label: '飞书', logo: '飞', color: '#00D6B9' },
  { id: 'wecom', label: '企业微信', logo: '企', color: '#4F7CFF' },
  { id: 'microsoft', label: 'Microsoft', logo: 'M', color: '#5E5CE6' },
];

export default function PhoneLogin() {
  const { lang } = useT();
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const refreshCount = useAuthStore((s) => s.refreshCount);
  const refreshing = useAuthStore((s) => s.refreshing);
  const loginOtp = useAuthStore((s) => s.loginOtp);
  const loginSso = useAuthStore((s) => s.loginSso);
  const silentRefresh = useAuthStore((s) => s.silentRefresh);
  const logout = useAuthStore((s) => s.logout);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<number | null>(null);

  const Phone = getIcon('dot');
  const Shield = getIcon('shield');
  const Bolt = getIcon('bolt');

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1 && timerRef.current !== null) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onSend = async () => {
    setError('');
    try {
      await sendSms(phone);
      startCountdown();
    } catch {
      setError(lang === 'zh' ? '请输入有效的手机号' : 'Enter a valid phone number');
    }
  };

  const onLogin = async () => {
    setError('');
    setBusy(true);
    try {
      await loginOtp(phone, code);
    } catch {
      setError(lang === 'zh' ? '验证码错误(演示请输入任意 6 位)' : 'Invalid code (demo: any 6 digits)');
    } finally {
      setBusy(false);
    }
  };

  const onSso = async (p: SsoProvider) => {
    setBusy(true);
    try {
      await loginSso(p);
    } finally {
      setBusy(false);
    }
  };

  if (user && tokens) {
    const expiresIn = Math.max(0, Math.round((tokens.expiresAt - Date.now()) / 1000));
    return (
      <div className="card" style={{ padding: 22 }}>
        <div className="row gap-3" style={{ marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--grad-accent)', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#fff', fontSize: 18 }}>
            {user.avatar}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 650 }}>{user.name}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--sub)' }}>{user.phone} · {user.role}</div>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={logout}>
            {lang === 'zh' ? '退出登录' : 'Sign out'}
          </button>
        </div>

        <div className="nav-group-label" style={{ padding: '0 0 8px' }}>
          {lang === 'zh' ? '双 Token 状态' : 'Dual-token state'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TokenRow label="Access Token" value={tokens.accessToken} color="#4F7CFF" />
          <TokenRow label="Refresh Token" value={tokens.refreshToken} color="#7C3AED" />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
            <span style={{ color: 'var(--sub)' }}>{lang === 'zh' ? 'Access 剩余有效期' : 'Access expires in'}</span>
            <span className="mono" style={{ color: expiresIn < 60 ? 'var(--warning)' : 'var(--success)' }}>{expiresIn}s</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
            <span style={{ color: 'var(--sub)' }}>{lang === 'zh' ? '静默刷新次数' : 'Silent refreshes'}</span>
            <span className="mono" style={{ color: 'var(--secondary)' }}>{refreshCount}</span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
          onClick={() => void silentRefresh()}
          disabled={refreshing}
        >
          <Bolt size={15} />
          {refreshing
            ? lang === 'zh' ? '刷新中…' : 'Refreshing…'
            : lang === 'zh' ? '触发静默刷新 Token' : 'Trigger silent refresh'}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, marginBottom: 3 }}>
          {lang === 'zh' ? '手机号验证码登录' : 'Phone + SMS Login'}
        </h3>
        <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
          {lang === 'zh' ? '双 Token + 单点登录(SSO)' : 'Dual-token + Single Sign-On'}
        </div>
      </div>

      <label style={lblStyle}>{lang === 'zh' ? '手机号' : 'Phone'}</label>
      <div className="row gap-2" style={{ marginBottom: 12 }}>
        <div className="row gap-2" style={{ flex: 1, ...fieldStyle }}>
          <Phone size={16} color="var(--sub)" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="138 0000 0000"
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
      </div>

      <label style={lblStyle}>{lang === 'zh' ? '验证码' : 'Verification code'}</label>
      <div className="row gap-2" style={{ marginBottom: 16 }}>
        <div className="row gap-2" style={{ flex: 1, ...fieldStyle }}>
          <Shield size={16} color="var(--sub)" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={lang === 'zh' ? '6 位验证码' : '6-digit code'}
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
        <button
          className="btn btn-ghost"
          style={{ minWidth: 116, justifyContent: 'center' }}
          disabled={countdown > 0 || phone.length !== 11}
          onClick={onSend}
        >
          {countdown > 0 ? `${countdown}s` : lang === 'zh' ? '获取验证码' : 'Send code'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center' }}
        disabled={busy || phone.length !== 11 || code.length !== 6}
        onClick={onLogin}
      >
        {busy ? (lang === 'zh' ? '登录中…' : 'Signing in…') : lang === 'zh' ? '登录' : 'Sign in'}
      </button>

      <div className="row gap-3" style={{ alignItems: 'center', margin: '18px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{lang === 'zh' ? '或使用 SSO' : 'or SSO'}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
      </div>

      <div className="grid-base grid-2">
        {SSO.map((s) => (
          <button
            key={s.id}
            className="btn btn-ghost"
            style={{ justifyContent: 'center', gap: 9 }}
            disabled={busy}
            onClick={() => onSso(s.id)}
          >
            <span style={{ width: 22, height: 22, borderRadius: 6, background: s.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
              {s.logo}
            </span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TokenRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
      <span style={{ color: 'var(--sub)' }}>{label}</span>
      <span className="mono" style={{ color, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

const lblStyle = { display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 } as const;
const fieldStyle = {
  padding: '10px 13px',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-1)',
  border: '1px solid var(--glass-border)',
} as const;
const inputStyle = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  width: '100%',
} as const;
