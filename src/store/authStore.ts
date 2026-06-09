import { create } from 'zustand';
import type { AuthTokens, AuthUser } from '@/types';
import { fetchMe, login as loginApi, logoutServer, refreshTokens } from '@/services/authService';
import { registerAuthHooks } from '@/services/api';

/** Session lifecycle: `loading` while a stored session is being validated on
 * boot; `authed` / `guest` thereafter. The route guard reads this. */
export type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  status: AuthStatus;
  refreshing: boolean;
  login: (username: string, password: string) => Promise<void>;
  silentRefresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Validate a restored session on app start. */
  bootstrap: () => Promise<void>;
}

const STORAGE = 'atlas-auth';

function persist(user: AuthUser | null, tokens: AuthTokens | null): void {
  if (typeof localStorage === 'undefined') return;
  if (user && tokens) localStorage.setItem(STORAGE, JSON.stringify({ user, tokens }));
  else localStorage.removeItem(STORAGE);
}

function restore(): { user: AuthUser | null; tokens: AuthTokens | null } {
  if (typeof localStorage === 'undefined') return { user: null, tokens: null };
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { user: null, tokens: null };
    const parsed = JSON.parse(raw);
    return { user: parsed.user ?? null, tokens: parsed.tokens ?? null };
  } catch {
    return { user: null, tokens: null };
  }
}

const initial = restore();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initial.user,
  tokens: initial.tokens,
  // If we have a stored session, stay in `loading` until bootstrap() validates
  // it, so the guard doesn't flash the login page for a logged-in user.
  status: initial.tokens ? 'loading' : 'guest',
  refreshing: false,

  login: async (username, password) => {
    const { user, tokens } = await loginApi(username, password);
    persist(user, tokens);
    set({ user, tokens, status: 'authed' });
  },

  silentRefresh: async () => {
    const { tokens, refreshing } = get();
    if (!tokens || refreshing) return;
    set({ refreshing: true });
    try {
      const next = await refreshTokens(tokens.refreshToken);
      persist(get().user, next);
      set({ tokens: next, refreshing: false });
    } catch {
      set({ refreshing: false });
      await get().logout();
    }
  },

  logout: async () => {
    const { tokens } = get();
    if (tokens?.refreshToken) await logoutServer(tokens.refreshToken);
    persist(null, null);
    set({ user: null, tokens: null, status: 'guest' });
  },

  bootstrap: async () => {
    const { tokens } = get();
    if (!tokens) {
      set({ status: 'guest' });
      return;
    }
    try {
      const user = await fetchMe(); // silently refreshes if access expired
      persist(user, get().tokens);
      set({ user, status: 'authed' });
    } catch {
      persist(null, null);
      set({ user: null, tokens: null, status: 'guest' });
    }
  },
}));

// Wire the api client's token access + silent refresh to this store, without
// the api module importing the store (avoids a circular import).
registerAuthHooks({
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  refresh: async () => {
    await useAuthStore.getState().silentRefresh();
    return useAuthStore.getState().tokens?.accessToken ?? null;
  },
});
