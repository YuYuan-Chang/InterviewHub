import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ACCEPT, UploadTray, useUploads } from '../components/UploadTray';
import type { Post } from '../types';

const SUGGESTED_TAGS = ['swe intern', 'system design', 'behavioral', 'resume', 'ml engineer', 'new grad'];

export function NewPostPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = useUploads();

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 8) setTags([...tags, t]);
    setTagInput('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (uploads.uploading) {
      setError('Wait for uploads to finish (or remove them)');
      return;
    }
    if (uploads.hasErrors) {
      setError('Remove the failed attachments first');
      return;
    }
    setBusy(true);
    try {
      const post = await api<Post>('/api/posts', {
        body: { title, description, tags, fileIds: uploads.fileIds },
      });
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form-card">
      <h2>Share prep material</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My Google SWE intern interview notes"
            minLength={3}
            required
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this? What worked, what didn't?"
          />
        </label>
        <label>
          Tags (role, topic, company…)
          <div className="tag-editor">
            {tags.map((t) => (
              <button type="button" key={t} className="tag tag-active" onClick={() => setTags(tags.filter((x) => x !== t))}>
                {t} ✕
              </button>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder={tags.length < 8 ? 'Type and press Enter' : 'Max 8 tags'}
              disabled={tags.length >= 8}
            />
          </div>
        </label>
        <div className="tag-suggestions">
          {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button type="button" key={t} className="tag" onClick={() => addTag(t)}>
              + {t}
            </button>
          ))}
        </div>

        <UploadTray items={uploads.items} onRemove={uploads.remove} />
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => fileInput.current?.click()}
            disabled={uploads.full}
          >
            📎 Add files {uploads.items.length > 0 && `(${uploads.items.length}/8)`}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files?.length) uploads.addFiles(e.target.files);
              e.target.value = ''; // allow re-selecting the same file
            }}
          />
          <p className="page-note attach-hint">Images, videos, PDFs & docs — up to 8 files, 10MB each.</p>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || uploads.uploading}>
          {busy ? 'Publishing…' : uploads.uploading ? 'Uploading…' : 'Publish'}
        </button>
      </form>
    </div>
  );
}
