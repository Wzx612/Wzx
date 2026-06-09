import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { tb } from '@/i18n/dict';
import { cn } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import type { Bi } from '@/types';

interface Props {
  title: Bi;
  crumb: string;
}

export default function Topbar({ title, crumb }: Props) {
  const { lang, t } = useT();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setLang = useUiStore((s) => s.setLang);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const Menu = getIcon('menu');
  const SearchIcon = getIcon('search');
  const Bell = getIcon('bell');
  const Sun = getIcon('sun');
  const Moon = getIcon('moon');
  const Bolt = getIcon('bolt');
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <header className="topbar">
      <button
        className="icon-btn menu-toggle"
        aria-label="Menu"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu />
      </button>

      <div className="page-title-wrap">
        <div className="page-title">{tb(title, lang)}</div>
        <div className="page-breadcrumb">{crumb}</div>
      </div>

      <div className="topbar-search">
        <SearchIcon />
        <input placeholder={t('search.placeholder')} />
        <span className="kbd">⌘K</span>
      </div>

      <div className="topbar-actions">
        <div className="lang-switch">
          <button className={cn(lang === 'zh' && 'on')} onClick={() => setLang('zh')}>
            中文
          </button>
          <button className={cn(lang === 'en' && 'on')} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
        <button className="icon-btn" aria-label="Theme" onClick={toggleTheme}>
          <ThemeIcon />
        </button>
        <button className="icon-btn" aria-label="Notifications">
          <Bell />
          <span className="notif-dot" />
        </button>
        <button className="btn btn-primary btn-sm">
          <Bolt size={15} />
          <span>{t('topbar.upgrade')}</span>
        </button>
      </div>
    </header>
  );
}
