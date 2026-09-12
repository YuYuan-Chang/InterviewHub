import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { INTERVIEW_STAGES } from '../interview';
import {
  PlanContents,
  PrepProgress,
  QueryState,
  SaveError,
  useSave,
} from '../components/Preparation';
import { WorkspaceQuestions } from '../components/WorkspaceQuestions';
import { WorkspaceResources } from '../components/WorkspaceResources';
import type { Page, PreparationInterview, PreparationPlan } from '../types';

const tabs = ['Overview', 'Tasks', 'Resources', 'Questions', 'Interviews'];

export function WorkspaceOverview({ plan }: { plan: PreparationPlan }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan);
  const { save, busy, error } = useSave();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const { name, company, role, jobUrl, jobDescription, notes } = draft;
    if (
      await save(`/plans/${plan.id}`, 'PATCH', {
        name,
        company,
        role,
        jobUrl,
        jobDescription,
        notes,
      })
    )
      setEditing(false);
  }
  if (editing)
    return (
      <form className="prep-form" onSubmit={submit}>
        <h2>Edit overview</h2>
        {(['name', 'company', 'role', 'jobUrl'] as const).map((field) => (
          <label key={field}>
            {
              {
                name: 'Plan name',
                company: 'Company (optional)',
                role: 'Role (optional)',
                jobUrl: 'Job posting URL (optional)',
              }[field]
            }
            <input
              required={field === 'name'}
              type={field === 'jobUrl' ? 'url' : 'text'}
              maxLength={field === 'jobUrl' ? 2000 : 120}
              value={draft[field] ?? ''}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            />
          </label>
        ))}
        {(['jobDescription', 'notes'] as const).map((field) => (
          <label key={field}>
            {field === 'notes' ? 'Preparation notes' : 'Job description'}
            <textarea
              rows={8}
              maxLength={field === 'notes' ? 10000 : 20000}
              value={draft[field] ?? ''}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            />
          </label>
        ))}
        <SaveError error={error} />
        <div className="prep-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !draft.name.trim()}
          >
            Save overview
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <section>
      <div className="prep-heading">
        <h2>Overview</h2>
        <button
          className="btn btn-ghost"
          onClick={() => {
            setDraft(plan);
            setEditing(true);
          }}
        >
          Edit overview
        </button>
      </div>
      {plan.jobUrl && (
        <p>
          <a href={plan.jobUrl} target="_blank" rel="noopener noreferrer">
            View job posting
          </a>
        </p>
      )}
      <h3>Job description</h3>
      <p className="prep-notes">
        {plan.jobDescription ||
          'Add the job description to keep your preparation focused.'}
      </p>
      <h3>Preparation notes</h3>
      <p className="prep-notes">
        {plan.notes || 'Capture your goals, research, and points to revisit.'}
      </p>
    </section>
  );
}

export function PreparationWorkspacePage() {
  const { planId = '' } = useParams();
  const { me } = useAuth();
  const [search] = useSearchParams();
  const selected = search.get('tab') ?? 'overview';
  const active =
    tabs.find((tab) => tab.toLowerCase() === selected)?.toLowerCase() ??
    'overview';
  const planQuery = useQuery({
    queryKey: ['preparation', me?.userId, 'workspace', planId],
    queryFn: () =>
      api<PreparationPlan>(`/api/users/me/preparation/plans/${planId}`),
  });
  const next = useQuery({
    queryKey: ['preparation', me?.userId, 'next', planId],
    queryFn: () =>
      api<Page<PreparationInterview>>(
        `/api/users/me/preparation/plans/${planId}/interviews?view=upcoming&limit=1`,
      ),
    enabled: !!planQuery.data,
  });
  if (planQuery.error instanceof ApiError && planQuery.error.status === 404)
    return (
      <section>
        <h1>Preparation plan unavailable</h1>
        <p>This plan was deleted or is not accessible to your account.</p>
        <Link to="/dashboard">Back to My preparation</Link>
      </section>
    );
  const plan = planQuery.data;
  const interview = next.data?.items[0];
  return (
    <div className="prep-workspace">
      <Link to="/dashboard">← My preparation</Link>
      <QueryState query={planQuery}>
        {plan && (
          <>
            <header className="card">
              <p className="page-note">Your private interview workspace</p>
              <h1>{plan.name}</h1>
              <p>{[plan.company, plan.role].filter(Boolean).join(' · ')}</p>
              <PrepProgress
                completed={plan.completedTasks}
                total={plan.totalTasks}
              />
              <QueryState query={next}>
                <p>
                  {interview
                    ? `Next interview: ${INTERVIEW_STAGES[interview.stage]} · ${new Date(interview.scheduledAt).toLocaleString()}`
                    : 'No upcoming interview scheduled.'}
                </p>
              </QueryState>
            </header>
            <nav className="workspace-tabs" aria-label="Workspace sections">
              {tabs.map((tab) => (
                <Link
                  key={tab}
                  className="btn btn-ghost"
                  aria-current={
                    active === tab.toLowerCase() ? 'page' : undefined
                  }
                  to={`?tab=${tab.toLowerCase()}`}
                >
                  {tab}
                </Link>
              ))}
            </nav>
            <div className="card workspace-panel" key={`${plan.id}-${active}`}>
              {active === 'overview' && <WorkspaceOverview plan={plan} />}
              {(active === 'tasks' || active === 'interviews') && (
                <PlanContents planId={plan.id} section={active} />
              )}
              {active === 'questions' && (
                <WorkspaceQuestions planId={plan.id} />
              )}
              {active === 'resources' && <WorkspaceResources plan={plan} />}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
