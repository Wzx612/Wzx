import { NavLink } from 'react-router-dom';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { tk, type DictKey } from '@/i18n/dict';
import { cn } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';

interface NavEntry {
  to: string;
  icon: string;
  labelKey: DictKey;
  badge?: string;
}
interface NavGroup {
  labelKey: DictKey;
  items: NavEntry[];
}

const NAV: NavGroup[] = [
  {
    labelKey: 'nav.workspace',
    items: [
      { to: '/', icon: 'grid', labelKey: 'nav.dashboard' },
      { to: '/search', icon: 'home', labelKey: 'nav.search' },
      { to: '/analysis', icon: 'trend', labelKey: 'nav.analysis' },
      { to: '/chat', icon: 'chat', labelKey: 'nav.chat', badge: '3' },
      { to: '/workflow', icon: 'workflow', labelKey: 'nav.workflow' },
    ],
  },
  {
    labelKey: 'nav.intelligence',
    items: [
      { to: '/investment', icon: 'invest', labelKey: 'nav.investment' },
      { to: '/mortgage', icon: 'bank', labelKey: 'nav.mortgage' },
      { to: '/report', icon: 'sparkle', labelKey: 'nav.report' },
      { to: '/vision', icon: 'vision', labelKey: 'nav.vision' },
      { to: '/rag', icon: 'layers', labelKey: 'nav.rag' },
      { to: '/knowledge', icon: 'book', labelKey: 'nav.knowledge' },
      { to: '/files', icon: 'folder', labelKey: 'nav.files' },
      { to: '/tools', icon: 'tool', labelKey: 'nav.tools' },
      { to: '/intelligence', icon: 'map', labelKey: 'nav.intel' },
      { to: '/analytics', icon: 'chart', labelKey: 'nav.analytics' },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { to: '/permissions', icon: 'shield', labelKey: 'nav.permissions' },
      { to: '/monitoring', icon: 'activity', labelKey: 'nav.monitoring' },
      { to: '/capabilities', icon: 'bolt', labelKey: 'nav.capabilities' },
      { to: '/settings', icon: 'settings', labelKey: 'nav.settings' },
    ],
  },
];

export default function Sidebar() {
  const { lang, t } = useT();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const Sparkle = getIcon('sparkle');

  return (
    <aside className={cn('sidebar', sidebarOpen && 'open')}>
      <NavLink to="/" className="brand">
        <div className="brand-mark">
          <Sparkle color="#fff" />
        </div>
        <div>
          <div className="brand-name">{t('brand.name')}</div>
          <div className="brand-sub">{t('brand.sub')}</div>
        </div>
      </NavLink>

      {NAV.map((group) => (
        <div key={group.labelKey}>
          <div className="nav-group-label">{t(group.labelKey)}</div>
          {group.items.map((item) => {
            const Icon = getIcon(item.icon);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => cn('nav-item', isActive && 'active')}
              >
                <Icon />
                <span>{tk(item.labelKey, lang)}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{lang === 'zh' ? '陈' : 'S'}</div>
          <div style={{ minWidth: 0 }}>
            <div className="u-name">{t('user.name')}</div>
            <div className="u-role">{t('user.role')}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
