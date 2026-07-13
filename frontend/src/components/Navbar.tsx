import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

export function Navbar() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

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
        Interview<span>Hub</span>
      </Link>
      <form className="search-form" onSubmit={submitSearch} role="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search posts, tags, people…"
          aria-label="Search"
        />
      </form>
      <div className="navbar-actions">
        {me ? (
          <>
            <Link to="/posts/new" className="btn btn-primary">
              Share
            </Link>
            <Link to="/notifications" className="bell" title="Notifications">
              🔔{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link to={`/u/${me.username}`} className="nav-user" title={`@${me.username}`}>
              <Avatar username={me.username} displayName={me.displayName} size="sm" />
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
