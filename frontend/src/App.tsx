import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { useAuth } from './auth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { FeedPage } from './pages/FeedPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { NewPostPage } from './pages/NewPostPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SearchPage } from './pages/SearchPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { SavedPage } from './pages/SavedPage';
import { CollectionPage } from './pages/CollectionPage';
import { DashboardPage } from './pages/DashboardPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="page-note">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar />
      <main className="container" id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<FeedPage mode="explore" />} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/following" element={<RequireAuth><FeedPage mode="following" /></RequireAuth>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/posts/new" element={<RequireAuth><NewPostPage /></RequireAuth>} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/saved" element={<RequireAuth><SavedPage /></RequireAuth>} />
          <Route path="/collections/:id" element={<CollectionPage />} />
          <Route path="/settings/profile" element={<RequireAuth><EditProfilePage /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
