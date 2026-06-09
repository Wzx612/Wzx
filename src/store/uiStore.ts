import { create } from 'zustand';
import type { Lang, Theme } from '@/types';

interface UiState {
  lang: Lang;
  theme: Theme;
  sidebarOpen: boolean;
  reduceMotion: boolean;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

const readLang = (): Lang => {
  if (typeof localStorage === 'undefined') return 'zh';
  return (localStorage.getItem('atlas-lang') as Lang) || 'zh';
};
const readTheme = (): Theme => {
  if (typeof localStorage === 'undefined') return 'dark';
  return (localStorage.getItem('atlas-theme') as Theme) || 'dark';
};

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
function applyLang(lang: Lang): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  lang: readLang(),
  theme: readTheme(),
  sidebarOpen: false,
  reduceMotion: false,

  setLang: (lang) => {
    localStorage.setItem('atlas-lang', lang);
    applyLang(lang);
    set({ lang });
  },
  toggleLang: () => get().setLang(get().lang === 'zh' ? 'en' : 'zh'),

  setTheme: (theme) => {
    localStorage.setItem('atlas-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
}));

/** Apply persisted theme/lang to <html> as early as possible. */
export function bootstrapUi(): void {
  applyTheme(readTheme());
  applyLang(readLang());
}
