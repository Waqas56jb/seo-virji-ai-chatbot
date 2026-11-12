import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import KnowledgeBasePage from './pages/KnowledgeBasePage.jsx';
import ConversationsPage from './pages/ConversationsPage.jsx';
import LeadsPage from './pages/LeadsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const TITLES = {
  '/': 'Overview',
  '/knowledge': 'Knowledge Base',
  '/conversations': 'Conversations',
  '/leads': 'Leads',
  '/settings': 'Chatbot Settings',
  '/login': 'Sign in',
};

function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const key = Object.keys(TITLES).find((k) => (k === '/' ? pathname === '/' : pathname.startsWith(k)));
    document.title = `${key ? TITLES[key] : 'Not found'} · SEO Virji Control Panel`;
  }, [pathname]);
}

/** Only signed-in admins reach the dashboard; everyone else is sent to /login. */
function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 14 }} role="status">
        Loading your control panel…
      </div>
    );
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  useDocumentTitle();
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="knowledge" element={<KnowledgeBasePage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="conversations/:conversationId" element={<ConversationsPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:leadId" element={<LeadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
