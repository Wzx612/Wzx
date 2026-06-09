import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
      </Routes>
    </BrowserRouter>
  );
}
