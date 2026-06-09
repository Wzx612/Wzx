import axios from 'axios';
import type { AuthTokens, AuthUser } from '@/types';
import { API_BASE, api } from './api';

/* ============================================================
   Auth service — real username/password login with a JWT
   dual-token (access + refresh) pair and server-side refresh
   rotation / revocation.

   Backend contract (FastAPI, see app/api/auth.py):
     POST /api/auth/login    { username, password } -> { user, tokens }
     POST /api/auth/refresh  { refreshToken }        -> { tokens }
     POST /api/auth/logout   { refreshToken }         -> { ok }
     GET  /api/auth/me                                -> user   (Bearer access)
   tokens = { accessToken, refreshToken, expiresAt(ms) }
   ============================================================ */

/**
 * Bare client for login/refresh/logout: these must NOT go through the shared
 * `api` instance, whose 401 interceptor performs a silent refresh — that would
 * recurse on a failed refresh and re-fire login on bad credentials.
 */
const authApi = axios.create({
  baseURL: API_BASE || '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

function detail(err: unknown, fallback: string): Error {
  const ax = err as { response?: { data?: { detail?: string } } };
  return new Error(ax?.response?.data?.detail ?? fallback);
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  try {
    const { data } = await authApi.post<{ user: AuthUser; tokens: AuthTokens }>(
      '/auth/login',
      { username, password },
    );
    return data;
  } catch (err) {
    throw detail(err, '登录失败,请稍后重试');
  }
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const { data } = await authApi.post<{ tokens: AuthTokens }>('/auth/refresh', { refreshToken });
  return data.tokens;
}

export async function logoutServer(refreshToken: string): Promise<void> {
  try {
    await authApi.post('/auth/logout', { refreshToken });
  } catch {
    /* best-effort: local sign-out proceeds regardless */
  }
}

/** Validate the session and fetch the current user. Uses the intercepted
 * `api` so an expired access token is silently refreshed before failing. */
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
