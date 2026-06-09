import type { AuthTokens, AuthUser, SsoProvider } from '@/types';
import { USE_MOCK, api } from './api';
import { wait } from '@/lib/format';

/* ============================================================
   Auth service — phone + SMS OTP login, dual-token (access /
   refresh) issuance and silent refresh, and SSO provider login.
   Backend contract:
     POST /auth/sms       { phone }            -> 200
     POST /auth/login     { phone, code }      -> { user, tokens }
     POST /auth/refresh   { refreshToken }     -> { tokens }
     POST /auth/sso       { provider }         -> { user, tokens }
   ============================================================ */

const ACCESS_TTL = 15 * 60 * 1000; // 15 min

function issueTokens(): AuthTokens {
  return {
    accessToken: `at_${Math.random().toString(36).slice(2)}`,
    refreshToken: `rt_${Math.random().toString(36).slice(2)}`,
    expiresAt: Date.now() + ACCESS_TTL,
  };
}

const MOCK_USER: AuthUser = {
  id: 'u_1',
  name: '陈思远',
  phone: '138****0000',
  role: 'Enterprise Admin',
  avatar: '陈',
};

export async function sendSms(phone: string): Promise<void> {
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new Error('invalid phone');
  }
  if (!USE_MOCK) {
    await api.post('/auth/sms', { phone });
    return;
  }
  await wait(500);
}

export async function loginWithOtp(
  phone: string,
  code: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  if (!/^\d{6}$/.test(code)) throw new Error('invalid code');
  if (!USE_MOCK) {
    const { data } = await api.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/login', {
      phone,
      code,
    });
    return data;
  }
  await wait(700);
  return { user: { ...MOCK_USER, phone: `${phone.slice(0, 3)}****${phone.slice(-4)}` }, tokens: issueTokens() };
}

export async function loginWithSso(
  provider: SsoProvider,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  if (!USE_MOCK) {
    const { data } = await api.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/sso', { provider });
    return data;
  }
  await wait(900);
  const names: Record<SsoProvider, string> = {
    google: 'Google SSO User',
    feishu: '飞书用户',
    wecom: '企业微信用户',
    microsoft: 'Entra User',
  };
  return { user: { ...MOCK_USER, name: names[provider] }, tokens: issueTokens() };
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  if (!USE_MOCK) {
    const { data } = await api.post<{ tokens: AuthTokens }>('/auth/refresh', { refreshToken });
    return data.tokens;
  }
  await wait(300);
  if (!refreshToken.startsWith('rt_')) throw new Error('invalid refresh token');
  return issueTokens();
}
