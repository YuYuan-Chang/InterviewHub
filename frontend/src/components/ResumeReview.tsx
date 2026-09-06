import { useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { applyPatch, createTwoFilesPatch, parsePatch } from 'diff';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { timeAgo } from '../format';
import type { Page, Post, ResumeRevision } from '../types';

export function DiffView({ patch }: { patch: string }) {
  return <pre className="resume-diff" aria-label="Unified diff: minus lines removed, plus lines added" tabIndex={0}>
    {patch.split('\n').map((line, index) => <span key={index} className={
      line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') ? 'diff-heading'
        : line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''
    }>{line || ' '}{'\n'}</span>)}
  </pre>;
}

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResumeReview({ post }: { post: Post }) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ base: string; version: number; text: string } | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const revisions = useInfiniteQuery({
    queryKey: ['resume-revisions', post.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page<ResumeRevision>>(`/api/posts/${post.id}/revisions${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const patch = useMemo(() => draft && draft.text !== draft.base
    ? createTwoFilesPatch('a/resume.md', 'b/resume.md', draft.base, draft.text) : '', [draft]);
  const stale = draft !== null && draft.version !== post.resumeVersion;
  const validDraft = !!draft?.text.trim() && draft.text.length <= 20000 && draft.text.split('\n').length <= 500;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['post', post.id] }),
      queryClient.invalidateQueries({ queryKey: ['resume-revisions', post.id] }),
      queryClient.invalidateQueries({ queryKey: ['feed'] }),
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] }),
      queryClient.invalidateQueries({ queryKey: ['search-posts'] }),
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !patch || stale || !validDraft) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/posts/${post.id}/revisions`, { body: { baseVersion: draft.version, proposedText: draft.text, summary } });
      setDraft(null); setSummary(''); setNotice('Your revision is ready for the author to review.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit revision');
      if (err instanceof ApiError && err.status === 409) await refresh();
    } finally { setBusy(false); }
  }

  async function decide(revision: ResumeRevision, status: 'accepted' | 'rejected') {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/posts/${post.id}/revisions/${revision.id}`, { method: 'PATCH', body: { status } });
      setNotice(status === 'accepted' ? 'Revision accepted. The resume text has been updated.' : 'Revision rejected.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review revision');
      if (err instanceof ApiError && err.status === 409) await refresh();
    } finally { setBusy(false); }
  }

  async function importPatch(file: File) {
    if (!draft) return;
    setError('');
    if (!/\.(patch|diff)$/i.test(file.name) || file.size > 100000) {
      setError('Choose a .patch or .diff file up to 100 KB.'); return;
    }
    setBusy(true);
    try {
      const patches = parsePatch((await file.text()).replace(/\r\n?/g, '\n'));
      if (patches.length !== 1 || !patches[0].hunks.length) throw new Error();
      const result = applyPatch(draft.base, patches[0], { fuzzFactor: 0 });
      if (result === false || !result.trim() || result.length > 20000 || result.split('\n').length > 500) throw new Error();
      setDraft({ ...draft, text: result });
      setNotice('Patch imported. Review the diff and submit your proposal.');
    } catch {
      setError('This must be a single-file unified diff matching the displayed resume, within the resume size limits.');
    } finally { setBusy(false); }
  }

  return <section className="card resume-review" id="resume">
    <div className="resume-heading"><div><span className="eyebrow">PEER REVIEW</span><h2>Resume <span className="tag">v{post.resumeVersion}</span></h2></div>
      <button className="btn btn-ghost" onClick={() => downloadText(post.resumeText ?? '', 'resume.md')}>Download text</button></div>
    <p className="page-note">Suggest specific improvements. The author decides which changes become part of the resume.</p>
    <pre className="resume-document">{post.resumeText}</pre>
    {post.attachments.length > 0 && <p className="page-note">Attachments above are the original files. Accepted revisions update this text only.</p>}
    {!draft && (me ? <button className="btn btn-primary" disabled={busy} onClick={() => {
      setDraft({ base: post.resumeText ?? '', version: post.resumeVersion, text: post.resumeText ?? '' });
      setError(''); setNotice('');
    }}>Propose a revision</button> : <p className="page-note"><Link to="/login">Log in</Link> to propose a revision.</p>)}
    {draft && <form className="form revision-form" onSubmit={submit}>
      <h3>Propose changes to v{draft.version}</h3>
      {stale && <p className="error" role="alert">The resume has changed since you started. Copy your work before cancelling, then start a new proposal from the latest version.</p>}
      <fieldset disabled={busy} className="revision-fields">
        <label>Revised resume<textarea className="resume-editor" rows={16} maxLength={20000} required value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value.replace(/\r\n?/g, '\n') })} /></label>
        <label>Or import a .patch / .diff<input type="file" accept=".patch,.diff" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (file) void importPatch(file);
        }} /></label>
        <p className="page-note">Import a single-file unified diff against v{draft.version}. It replaces the draft above.</p>
        <label>Why these changes?<textarea rows={2} required minLength={3} maxLength={1000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="e.g. Make the impact of your internship easier to see." /></label>
      </fieldset>
      <h4>Diff preview</h4>
      {patch ? <DiffView patch={patch} /> : <p className="page-note">Edit the resume or import a patch to see additions and deletions here.</p>}
      {!validDraft && <p className="error">Use non-empty text, at most 20,000 characters and 500 lines.</p>}
      <div className="resume-actions">
        <button className="btn btn-primary" disabled={busy || !patch || stale || !validDraft || summary.trim().length < 3}>{busy ? 'Saving…' : 'Submit revision'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setDraft(null); setSummary(''); }}>Cancel</button>
        {patch && <button type="button" className="btn btn-ghost" onClick={() => downloadText(patch, 'resume.patch')}>Download .patch</button>}
      </div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="page-note" role="status">{notice}</p>}
    <div className="revision-history"><h3>Proposed revisions</h3>
      {revisions.isLoading && <p className="page-note" role="status">Loading revisions…</p>}
      {revisions.isError && <p className="error" role="alert">Could not load revisions. <button className="btn btn-ghost" onClick={() => void revisions.refetch()}>Try again</button></p>}
      {revisions.isSuccess && revisions.data.pages[0].items.length === 0 && <p className="page-note">No revisions yet. Be the first to suggest an improvement.</p>}
      {revisions.data?.pages.flatMap((page) => page.items).map((revision) => <article className="revision-card" key={revision.id}>
        <div className="resume-heading"><strong>{revision.author ? <Link to={`/u/${revision.author.username}`}>{revision.author.displayName}</Link> : 'Community member'}</strong>
          <span className={`revision-status status-${revision.status}`}>{revision.status}</span></div>
        <p className="page-note">Based on v{revision.baseVersion} · {timeAgo(revision.createdAt)}{revision.status === 'pending' && revision.baseVersion !== post.resumeVersion ? ' · Outdated — a new proposal is needed' : ''}</p>
        <p className="revision-summary">{revision.summary}</p>
        <details><summary>View changes</summary><DiffView patch={revision.patch} /></details>
        <div className="resume-actions">
          <button className="btn btn-ghost" onClick={() => downloadText(revision.patch, `resume-v${revision.baseVersion}-${revision.id}.patch`)}>Download .patch</button>
          {me?.userId === post.authorId && revision.status === 'pending' && <>
            <button className="btn btn-primary" disabled={busy || revision.baseVersion !== post.resumeVersion} onClick={() => void decide(revision, 'accepted')}>Accept changes</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void decide(revision, 'rejected')}>Reject</button>
          </>}
        </div>
      </article>)}
      {revisions.hasNextPage && <button className="btn btn-ghost" disabled={revisions.isFetchingNextPage} onClick={() => void revisions.fetchNextPage()}>{revisions.isFetchingNextPage ? 'Loading…' : 'Load more revisions'}</button>}
    </div>
  </section>;
}
