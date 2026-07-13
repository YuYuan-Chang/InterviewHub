import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    displayName: '',
    school: '',
    targetRoles: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({
        ...form,
        targetRoles: form.targetRoles
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card">
      <h2>Join InterviewHub</h2>
      <p className="page-note">Share prep materials, get feedback from peers.</p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </label>
        <label>
          Password (8+ characters)
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            pattern="[A-Za-z0-9_]{3,30}"
            title="3-30 characters: letters, numbers, underscores"
            required
          />
        </label>
        <label>
          Display name
          <input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} required />
        </label>
        <label>
          School
          <input value={form.school} onChange={(e) => set('school', e.target.value)} placeholder="e.g. UC Berkeley" />
        </label>
        <label>
          Target roles (comma-separated)
          <input
            value={form.targetRoles}
            onChange={(e) => set('targetRoles', e.target.value)}
            placeholder="SWE intern, ML engineer"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="page-note">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
