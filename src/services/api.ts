import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosError,
} from 'axios';

/* ============================================================
   API client.
   Talks to the FastAPI + LangGraph backend when VITE_API_BASE
   is configured; otherwise the service layer falls back to the
   bundled mock data so the UI is fully functional offline.

   Implements dual-token auth: a request interceptor attaches the
   access token; a 401 response interceptor performs a single
   silent refresh and replays queued requests. Auth hooks are
   *registered* by the auth store rather than imported, to avoid
   a circular dependency (api <-> authStore <-> authService).
   ============================================================ */

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** True when no live backend is configured — the app uses mock data. */
export const USE_MOCK = API_BASE.length === 0;

interface AuthHooks {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
}

let authHooks: AuthHooks | null = null;
/** Called once by the auth store to wire token access + refresh. */
export function registerAuthHooks(hooks: AuthHooks): void {
  authHooks = hooks;
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE || '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach bearer token to every request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authHooks?.getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// 401 -> single silent refresh + replay of queued requests.
let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;

    if (error.response?.status === 401 && authHooks && original && !original._retried) {
      original._retried = true;
      try {
        refreshing = refreshing ?? authHooks.refresh();
        const newToken = await refreshing;
        refreshing = null;
        if (newToken) {
          original.headers.set('Authorization', `Bearer ${newToken}`);
          return api(original);
        }
      } catch {
        refreshing = null;
      }
    }

    const message =
      (error.response?.data as { detail?: string } | undefined)?.detail ??
      error.message ??
      'Request failed';
    return Promise.reject(new Error(message));
  },
);

/**
 * fetch() wrapper that attaches the bearer access token and performs a single
 * silent refresh + retry on 401 — for requests the axios client can't handle
 * cleanly in the browser (multipart uploads, SSE streaming responses). The URL
 * is used as-is (callers pass the full /api/... path).
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const build = (token: string | null): RequestInit => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };
  let res = await fetch(input, build(authHooks?.getAccessToken() ?? null));
  if (res.status === 401 && authHooks) {
    const token = await authHooks.refresh();
    if (token) res = await fetch(input, build(token));
  }
  return res;
}
