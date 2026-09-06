import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ACCEPT, UploadTray, useUploads } from '../components/UploadTray';
import type { Post } from '../types';
import { INTERVIEW_STAGES, INTERVIEW_DIFFICULTIES, INTERVIEW_OUTCOMES, type InterviewExperience } from '../interview';
import { useQueryClient } from '@tanstack/react-query';

const SUGGESTED_TAGS = ['swe intern', 'system design', 'behavioral', 'resume', 'ml engineer', 'new grad'];

export function NewPostPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState<'material' | 'experience' | 'resume'>('material');
  const [experience, setExperience] = useState<InterviewExperience>({
    company: '', role: '', stage: 'technical', questions: '', difficulty: 'medium', outcome: 'pending',
  });
  const resumeReview = type === 'resume';
  const [resumeText, setResumeText] = useState('');
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
        body: { title, description, tags, fileIds: uploads.fileIds, type: resumeReview ? 'material' : type,
          ...(resumeReview ? { resumeText } : {}),
          ...(type === 'experience' ? { interviewExperience: experience } : {}),
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['popular-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['search-posts'] });
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form-card">
      <span className="eyebrow">PASS IT FORWARD</span>
      <h1>{resumeReview ? 'Share your resume' : type === 'experience' ? 'Share your interview experience' : 'Share a resource'}</h1>
      <p className="page-note">{resumeReview ? 'Get specific edits from your peers, review the diff, and accept the changes you want.' : 'Interview notes, a useful guide, or a lesson learned. Help someone take their next step.'}</p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Post type
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="material">Prep material</option>
            <option value="experience">Interview experience</option>
            <option value="resume">Resume review</option>
          </select>
        </label>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My Google SWE intern interview notes"
            minLength={3}
            maxLength={160}
            required
          />
        </label>
        {type === 'experience' && (
          <fieldset className="experience-fields">
            <legend>Interview details</legend>
            <p className="page-note attach-hint">Help others prepare by sharing what you were asked and how it went. All fields below are required.</p>
            <div className="experience-form-grid">
              <label>Company
                <input required maxLength={120} pattern=".*\S.*" value={experience.company} placeholder="e.g. Google"
                  onChange={(e) => setExperience({ ...experience, company: e.target.value })} />
              </label>
              <label>Role
                <input required maxLength={120} pattern=".*\S.*" value={experience.role} placeholder="e.g. Software engineer intern"
                  onChange={(e) => setExperience({ ...experience, role: e.target.value })} />
              </label>
              <label>Interview stage
                <select value={experience.stage} onChange={(e) => setExperience({ ...experience, stage: e.target.value as InterviewExperience['stage'] })}>
                  {Object.entries(INTERVIEW_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Difficulty
                <select value={experience.difficulty} onChange={(e) => setExperience({ ...experience, difficulty: e.target.value as InterviewExperience['difficulty'] })}>
                  {Object.entries(INTERVIEW_DIFFICULTIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Outcome
                <select value={experience.outcome} onChange={(e) => setExperience({ ...experience, outcome: e.target.value as InterviewExperience['outcome'] })}>
                  {Object.entries(INTERVIEW_OUTCOMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <label>Questions asked
              <textarea required maxLength={5000} rows={5} value={experience.questions}
                placeholder="What questions or exercises came up? Include any follow-up questions."
                onChange={(e) => setExperience({ ...experience, questions: e.target.value })} />
            </label>
          </fieldset>
        )}
        <label>
          {type === 'experience' ? 'Advice & reflections (optional)' : 'Description (optional)'}
          <textarea
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this? What worked, what didn't?"
          />
        </label>
        {resumeReview && (
          <label>
            Resume text
            <textarea aria-label="Resume text" aria-describedby="resume-help resume-attachments-help" className="resume-editor" rows={16} value={resumeText} onChange={(e) => setResumeText(e.target.value)} maxLength={20000} required
              placeholder={'# Your name\n\n## Experience\n- Built…\n\n## Education\n…'} />
            <span id="resume-help" className="page-note">Paste plain text or Markdown, up to 20,000 characters and 500 lines. Others can propose line-by-line changes. You choose which to accept. This text will be public.</span>
            <span id="resume-attachments-help" className="page-note">You can also attach your PDF below for reference. Accepted changes update the text; the PDF stays as uploaded.</span>
          </label>
        )}
        <label>
          Tags (role, topic, company…)
          <div className="tag-editor">
            {tags.map((t) => (
              <button type="button" key={t} className="tag tag-active" onClick={() => setTags(tags.filter((x) => x !== t))}>
                <span className="sr-only">Remove tag </span>{t} ✕
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
            <button type="button" key={t} className="tag" disabled={tags.length >= 8} onClick={() => addTag(t)}>
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

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || uploads.uploading}>
          {busy ? 'Publishing…' : uploads.uploading ? 'Uploading…' : 'Publish'}
        </button>
      </form>
    </div>
  );
}
