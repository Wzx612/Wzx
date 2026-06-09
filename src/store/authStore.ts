import { create } from 'zustand';
import type { AuthTokens, AuthUser, SsoProvider } from '@/types';
import { loginWithOtp, loginWithSso, refreshTokens } from '@/services/authService';
import { registerAuthHooks } from '@/services/api';

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  refreshing: boolean;
  /** number of silent refreshes performed this session (for the demo log) */
  refreshCount: number;
  loginOtp: (phone: string, code: string) => Promise<void>;
  loginSso: (provider: SsoProvider) => Promise<void>;
  silentRefresh: () => Promise<void>;
  logout: () => void;
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
    return JSON.parse(raw);
  } catch {
    return { user: null, tokens: null };
  }
}

const initial = restore();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initial.user,
  tokens: initial.tokens,
  refreshing: false,
  refreshCount: 0,

  loginOtp: async (phone, code) => {
    const { user, tokens } = await loginWithOtp(phone, code);
    persist(user, tokens);
    set({ user, tokens });
  },

  loginSso: async (provider) => {
    const { user, tokens } = await loginWithSso(provider);
    persist(user, tokens);
    set({ user, tokens });
  },

  silentRefresh: async () => {
    const { tokens, refreshing } = get();
    if (!tokens || refreshing) return;
    set({ refreshing: true });
    try {
      const next = await refreshTokens(tokens.refreshToken);
      persist(get().user, next);
      set((s) => ({ tokens: next, refreshing: false, refreshCount: s.refreshCount + 1 }));
    } catch {
      set({ refreshing: false });
      get().logout();
    }
  },

  logout: () => {
    persist(null, null);
    set({ user: null, tokens: null });
  },
}));

// Wire the api client's token access + silent refresh to this store,
// without the api module importing the store (avoids a circular import).
registerAuthHooks({
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  refresh: async () => {
    await useAuthStore.getState().silentRefresh();
    return useAuthStore.getState().tokens?.accessToken ?? null;
  },
});
