import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { cn } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import type { Bi } from '@/types';

interface Props {
  title: Bi;
  crumb: string;
  /** when true, the main area is a fixed-height non-scrolling shell (chat / workflow / GIS) */
  fixedHeight?: boolean;
  /** render children directly inside .main instead of a .content wrapper */
  bare?: boolean;
  wide?: boolean;
  children: ReactNode;
}

export default function AppShell({ title, crumb, fixedHeight, bare, wide, children }: Props) {
  const location = useLocation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  return (
    <>
      <div className="bg-aurora" />
      <div className="app">
        <Sidebar />
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 20 }}
            aria-hidden
          />
        )}
        <div className={cn('main', fixedHeight && 'fixed-h')}>
          <Topbar title={title} crumb={crumb} />
          {bare ? (
            children
          ) : (
            <motion.main
              key={location.pathname}
              className={cn('content', wide && 'content-wide')}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.main>
          )}
        </div>
      </div>
    </>
  );
}
