import type { ReactNode } from 'react';

export function Feedback({ title, children, error = false }: { title: string; children: ReactNode; error?: boolean }) {
  return (
    <div className={`feedback ${error ? 'feedback-error' : ''}`} role={error ? 'alert' : 'status'}>
      <span className="feedback-symbol" aria-hidden="true">{error ? '!' : '◎'}</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function FeedLoading() {
  return (
    <div role="status" aria-label="Loading posts" className="feed-loading">
      {[0, 1, 2].map((item) => (
        <div className="card skeleton-card" key={item} aria-hidden="true">
          <div className="skeleton skeleton-author" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton" />
          <div className="skeleton skeleton-short" />
        </div>
      ))}
      <span className="sr-only">Loading posts…</span>
    </div>
  );
}
