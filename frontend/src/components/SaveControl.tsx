import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { refreshSavedQueries } from '../saved';
import type { Collection, Post, SavedResource } from '../types';
import { Dialog } from './Dialog';

function SavedEditor({ resource, collections, onClose }: {
  resource: SavedResource;
  collections: Collection[];
  onClose(): void;
}) {
  const client = useQueryClient();
  const [notes, setNotes] = useState(resource.notes);
  const [reviewed, setReviewed] = useState(resource.reviewed);
  const [selected, setSelected] = useState(resource.collectionIds);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createCollection() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const collection = await api<Collection>('/api/posts/collections', { body: { name: name.trim() } });
      setSelected((ids) => [...ids, collection.id]);
      setName('');
      await client.invalidateQueries({ queryKey: ['collections'] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create collection.'); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/posts/${resource.post.id}/save`, {
        method: 'PUT', body: { notes, reviewed, collectionIds: selected },
      });
      await refreshSavedQueries(client);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your changes.'); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/posts/${resource.post.id}/save`, { method: 'DELETE' });
      onClose();
      await refreshSavedQueries(client);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove saved resource.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog title="Organize saved resource" onClose={onClose} busy={busy}>
      <p className="saved-dialog-title">{resource.post.title}</p>
      <p className="page-note">Your collections, notes, and review status are private.</p>
      <form className="form" onSubmit={save}>
        <fieldset className="collection-picker" disabled={busy}>
          <legend>Collections</legend>
          <div className="collection-options">
            {collections.map((collection) => (
              <label className="check-row" key={collection.id}>
                <input type="checkbox" checked={selected.includes(collection.id)}
                  onChange={(event) => setSelected((ids) => event.target.checked
                    ? [...ids, collection.id] : ids.filter((id) => id !== collection.id))} />
                <span>{collection.name}</span>
              </label>
            ))}
            {collections.length === 0 && <p className="page-note">Create a collection to group resources by goal or topic.</p>}
          </div>
          <div className="inline-collection-form">
            <input aria-label="New collection name" placeholder="e.g. SWE interview prep" maxLength={80} value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createCollection(); } }} />
            <button type="button" className="btn btn-ghost" disabled={!name.trim()} onClick={() => void createCollection()}>Create</button>
          </div>
        </fieldset>
        <label>Private notes
          <textarea rows={4} maxLength={5000} value={notes} disabled={busy}
            placeholder="What do you want to remember or practice?" onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="check-row"><input type="checkbox" checked={reviewed} disabled={busy}
          onChange={(event) => setReviewed(event.target.checked)} /> I’ve reviewed this resource</label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
      <details className="remove-saved">
        <summary>Remove from saved resources</summary>
        <p>This removes your private notes and collection memberships for this resource. The original post stays available.</p>
        <button type="button" className="btn btn-ghost danger-text" disabled={busy} onClick={() => void remove()}>Remove saved resource</button>
      </details>
    </Dialog>
  );
}

function SavedDialog({ postId, userId, onClose }: { postId: string; userId: string; onClose(): void }) {
  const saved = useQuery({ queryKey: ['saved-resource', userId, postId],
    queryFn: () => api<SavedResource>(`/api/posts/${postId}/save`), staleTime: 0 });
  const collections = useQuery({ queryKey: ['collections', userId],
    queryFn: () => api<{ items: Collection[] }>('/api/posts/collections') });
  if (saved.isError || collections.isError) return (
    <Dialog title="Organize saved resource" onClose={onClose}>
      <p role="alert">{saved.error?.message ?? collections.error?.message ?? 'Could not load saved resource.'}</p>
      <button className="btn btn-ghost" onClick={() => { void saved.refetch(); void collections.refetch(); }}>Try again</button>
    </Dialog>
  );
  if (!saved.data || !collections.data) return <Dialog title="Organize saved resource" onClose={onClose}><p role="status">Loading your library…</p></Dialog>;
  return <SavedEditor resource={saved.data} collections={collections.data.items} onClose={onClose} />;
}

export function SaveControl({ post }: { post: Post }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!me) { navigate('/login'); return; }
    if (post.viewerHasSaved) { setOpen(true); return; }
    setBusy(true);
    setError('');
    try {
      const resource = await api<SavedResource>(`/api/posts/${post.id}/save`, { method: 'PUT', body: {} });
      client.setQueryData(['saved-resource', me.userId, post.id], resource);
      await refreshSavedQueries(client);
      setOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save this resource.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button className={`action ${me && post.viewerHasSaved ? 'action-active' : ''}`} disabled={busy}
        aria-haspopup="dialog" title={me && post.viewerHasSaved ? 'Manage saved resource' : 'Save resource'}
        onClick={() => void save()}>
        <svg width="16" height="18" viewBox="0 0 16 18" fill={me && post.viewerHasSaved ? 'currentColor' : 'none'} aria-hidden="true">
          <path d="M3 2h10v14l-5-3-5 3V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {busy ? 'Saving…' : me && post.viewerHasSaved ? 'Saved' : 'Save'}
      </button>
      {error && <span className="error save-error" role="alert">{error}</span>}
      {open && me && <SavedDialog postId={post.id} userId={me.userId} onClose={() => setOpen(false)} />}
    </>
  );
}
