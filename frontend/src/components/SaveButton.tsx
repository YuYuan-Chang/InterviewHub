import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Collection, Post } from '../types';

/**
 * Save control: the button alone toggles the bookmark, the caret opens a picker
 * for filing the post in collections. Filing also saves, and un-saving clears the
 * post from every collection — the server enforces both, we just mirror it here.
 */
export function SaveButton({ post, onChanged }: { post: Post; onChanged?: (p: Post) => void }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const picker = useQuery({
    queryKey: ['collections', 'picker', post.id],
    queryFn: () => api<{ items: Collection[] }>(`/api/collections?postId=${post.id}`),
    enabled: open && !!me,
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function refresh(saved: boolean) {
    onChanged?.({ ...post, viewerHasBookmarked: saved });
    for (const key of [['feed'], ['search-posts'], ['profile-posts'], ['post', post.id], ['bookmarks'], ['collections']]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!me) {
      navigate('/login');
      return;
    }
    await run(async () => {
      await api(`/api/posts/${post.id}/bookmark`, { method: post.viewerHasBookmarked ? 'DELETE' : 'PUT' });
      refresh(!post.viewerHasBookmarked);
    });
  }

  async function toggleCollection(collection: Collection) {
    await run(async () => {
      if (collection.containsPost) {
        await api(`/api/collections/${collection.id}/posts/${post.id}`, { method: 'DELETE' });
        refresh(post.viewerHasBookmarked);
      } else {
        await api(`/api/collections/${collection.id}/posts`, { body: { postId: post.id } });
        refresh(true); // filing a post saves it too
      }
    });
  }

  async function createAndFile(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await run(async () => {
      const created = await api<Collection>('/api/collections', { body: { name } });
      await api(`/api/collections/${created.id}/posts`, { body: { postId: post.id } });
      setNewName('');
      refresh(true);
    });
  }

  function openPicker() {
    if (!me) {
      navigate('/login');
      return;
    }
    setOpen((v) => !v);
  }

  const saved = post.viewerHasBookmarked;

  return (
    <div className="save-control" ref={wrapRef}>
      <button
        className={`action ${saved ? 'action-active' : ''}`}
        onClick={toggleSave}
        title={saved ? 'Remove from saved' : 'Save for later'}
        aria-label={saved ? 'Remove from saved' : 'Save for later'}
        aria-pressed={saved}
        disabled={busy}
      >
        {saved ? '★' : '☆'} <span className="action-label">{saved ? 'Saved' : 'Save'}</span>
      </button>
      <button
        className="action save-caret"
        onClick={openPicker}
        title="Save to a collection"
        aria-label="Save to a collection"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy}
      >
        ▾
      </button>

      {open && (
        <div className="save-popover" role="dialog" aria-label="Save to a collection">
          <p className="save-popover-title">Save to a collection</p>
          {picker.isLoading && <p className="page-note">Loading…</p>}
          {picker.isError && <p className="error">We couldn’t load your collections.</p>}
          {picker.isSuccess && picker.data.items.length === 0 && (
            <p className="page-note">No collections yet — name one below.</p>
          )}
          <ul className="save-collection-list">
            {picker.data?.items.map((c) => (
              <li key={c.id}>
                <button
                  className={`save-collection ${c.containsPost ? 'save-collection-active' : ''}`}
                  onClick={() => toggleCollection(c)}
                  aria-pressed={!!c.containsPost}
                  disabled={busy}
                >
                  <span aria-hidden="true">{c.containsPost ? '✓' : '＋'}</span>
                  <span className="save-collection-name">{c.name}</span>
                  <span className="page-note">{c.itemCount}</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="save-new" onSubmit={createAndFile}>
            <label className="sr-only" htmlFor={`new-collection-${post.id}`}>
              New collection name
            </label>
            <input
              id={`new-collection-${post.id}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection…"
              maxLength={80}
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
              Create
            </button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
      {error && !open && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
