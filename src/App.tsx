import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getIcon } from '@/lib/icons';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Search from '@/pages/Search';
import Analysis from '@/pages/Analysis';
import Investment from '@/pages/Investment';
import Mortgage from '@/pages/Mortgage';
import Report from '@/pages/Report';
import Chat from '@/pages/Chat';
import Workflow from '@/pages/Workflow';
import Knowledge from '@/pages/Knowledge';
import Tools from '@/pages/Tools';
import Intelligence from '@/pages/Intelligence';
import Analytics from '@/pages/Analytics';
import Permissions from '@/pages/Permissions';
import Monitoring from '@/pages/Monitoring';
import Settings from '@/pages/Settings';
import Capabilities from '@/pages/Capabilities';
import ImageUnderstanding from '@/pages/ImageUnderstanding';
import RAG from '@/pages/RAG';
import Files from '@/pages/Files';

/** Full-screen loading state shown while a restored session is being validated. */
function BootSplash() {
  const Loader = getIcon('loader');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #0a0c12)' }}>
      <Loader size={26} color="var(--sub)" style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

/** Route guard: gates every protected route behind an authenticated session. */
function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <BootSplash />;
  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Validate any restored session once on startup.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — everything else requires a valid session */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/investment" element={<Investment />} />
          <Route path="/mortgage" element={<Mortgage />} />
          <Route path="/report" element={<Report />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/workflow" element={<Workflow />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/capabilities" element={<Capabilities />} />
          <Route path="/vision" element={<ImageUnderstanding />} />
          <Route path="/rag" element={<RAG />} />
          <Route path="/files" element={<Files />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
