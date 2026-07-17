import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadWithProgress } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../components/Avatar';

export function EditProfilePage() {
  const { me, reloadMe } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [school, setSchool] = useState(me?.school ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [roles, setRoles] = useState<string[]>(me?.targetRoles ?? []);
  const [roleInput, setRoleInput] = useState('');
  const [avatarFileId, setAvatarFileId] = useState<string | null>(me?.avatarFileId ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null); // local object URL while uploading
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!me) return null; // route is wrapped in RequireAuth
  const username = me.username;

  function addRole(raw: string) {
    const r = raw.trim();
    if (r && !roles.includes(r) && roles.length < 10) setRoles([...roles, r]);
    setRoleInput('');
  }

  function onPickAvatar(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Avatar must be an image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Avatar image must be under 10MB');
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
    setUploadPct(0);
    const { promise } = uploadWithProgress(file, setUploadPct);
    promise
      .then((uploaded) => {
        setAvatarFileId(uploaded.id);
        setUploadPct(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setAvatarPreview(null);
        setUploadPct(null);
      });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (uploadPct !== null) {
      setError('Wait for the photo upload to finish');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/users/me', {
        method: 'PATCH',
        body: { displayName, school, bio, targetRoles: roles, avatarFileId },
      });
      await reloadMe();
      navigate(`/u/${username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form-card">
      <h2>Edit profile</h2>
      <form onSubmit={onSubmit} className="form">
        <div className="avatar-editor">
          {avatarPreview ? (
            <img className="avatar avatar-img" style={{ width: 96, height: 96 }} src={avatarPreview} alt="New avatar" />
          ) : (
            <Avatar username={me.username} displayName={displayName} fileId={avatarFileId} size="xl" />
          )}
          <div className="avatar-editor-actions">
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              {uploadPct !== null ? `Uploading ${uploadPct}%` : avatarFileId || avatarPreview ? 'Change photo' : 'Add photo'}
            </button>
            {(avatarFileId || avatarPreview) && uploadPct === null && (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setAvatarFileId(null);
                  setAvatarPreview(null);
                }}
              >
                Remove
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickAvatar(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={1} maxLength={80} required />
        </label>
        <label>
          School
          <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} placeholder="e.g. UC Berkeley" />
        </label>
        <label>
          Bio
          <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} placeholder="What are you prepping for? What can you help others with?" />
        </label>
        <label>
          Target roles
          <div className="tag-editor">
            {roles.map((r) => (
              <button type="button" key={r} className="tag tag-active" onClick={() => setRoles(roles.filter((x) => x !== r))}>
                {r} ✕
              </button>
            ))}
            <input
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addRole(roleInput);
                }
              }}
              placeholder={roles.length < 10 ? 'Type and press Enter' : 'Max 10 roles'}
              disabled={roles.length >= 10}
            />
          </div>
        </label>

        {error && <p className="error">{error}</p>}
        <div className="edit-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/u/${username}`)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || uploadPct !== null}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
