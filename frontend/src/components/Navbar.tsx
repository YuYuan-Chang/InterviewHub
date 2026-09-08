import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

export function Navbar() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const location = useLocation();

  useEffect(() => {
    setQ(new URLSearchParams(location.search).get('q') ?? '');
  }, [location.search]);

  const { data } = useQuery({
    queryKey: ['notifications', 'badge'],
    queryFn: () => api<{ unreadCount: number }>('/api/notifications?limit=1'),
    enabled: !!me,
    refetchInterval: 30_000,
  });
  const unread = data?.unreadCount ?? 0;

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">ih</span>
        Interview<span>Hub</span>
      </Link>
      <nav className="primary-nav" aria-label="Main navigation">
        <NavLink to="/" end>Explore</NavLink>
        {me && <NavLink to="/following">Following</NavLink>}
        {me && <NavLink to="/saved">Saved</NavLink>}
      </nav>
      <form className="search-form" onSubmit={submitSearch} role="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search posts, tags, people…"
          aria-label="Search posts, tags, and people"
        />
        <button type="submit" className="search-submit" aria-label="Submit search" disabled={!q.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
          </svg>
        </button>
      </form>
      <div className="navbar-actions">
        {me ? (
          <>
            <NavLink to="/saved" className="mobile-saved-link">Saved</NavLink>
            <Link to="/posts/new" className="btn btn-primary">
              <span aria-hidden="true">＋ </span>Share
            </Link>
            <Link to="/notifications" className="bell" title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              🔔{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link to={`/u/${me.username}`} className="nav-user" title={`@${me.username}`} aria-label="Your profile">
              <Avatar username={me.username} displayName={me.displayName} fileId={me.avatarFileId} size="sm" />
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
