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
  const [showPassword, setShowPassword] = useState(false);

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
      <h1>Join InterviewHub</h1>
      <p className="page-note">Share prep materials, get feedback from peers.</p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Email
          <input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </label>
        <label>
          Password (8+ characters)
          <span className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            aria-label="Password (8+ characters)"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            minLength={8}
            required
          />
          <button type="button" className="password-toggle" aria-pressed={showPassword} aria-label="Show password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        <label>
          Username
          <input
            value={form.username}
            autoComplete="username"
            aria-describedby="username-hint"
            onChange={(e) => set('username', e.target.value)}
            pattern="[A-Za-z0-9_]{3,30}"
            title="3-30 characters: letters, numbers, underscores"
            required
          />
          <span className="field-hint" id="username-hint">3–30 characters. Use letters, numbers, or underscores.</span>
        </label>
        <label>
          Display name
          <input autoComplete="nickname" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} required />
        </label>
        <label>
          School (optional)
          <input value={form.school} onChange={(e) => set('school', e.target.value)} placeholder="e.g. UC Berkeley" />
        </label>
        <label>
          Target roles (optional, comma-separated)
          <input
            value={form.targetRoles}
            onChange={(e) => set('targetRoles', e.target.value)}
            placeholder="SWE intern, ML engineer"
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
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
