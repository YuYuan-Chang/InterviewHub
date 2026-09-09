import { useState, type FormEvent, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { INTERVIEW_STAGES } from '../interview';
import { isOverdue, localDateTime, progress } from '../preparation';
import type {
  Collection,
  Page,
  PreparationInterview,
  PreparationPlan,
  PreparationSummary,
  PreparationTask,
} from '../types';

const base = '/api/users/me/preparation';
function usePrepList<T>(path: string) {
  const { me } = useAuth();
  return useInfiniteQuery({
    queryKey: ['preparation', me?.userId, path],
    queryFn: ({ pageParam }) =>
      api<Page<T>>(
        `${base}${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageParam)}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });
}
function useSave() {
  const { me } = useAuth();
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await api(`${base}${path}`, { method, body });
      await cache.invalidateQueries({ queryKey: ['preparation', me?.userId] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, error, busy };
}
function QueryState({
  query,
  children,
}: {
  query: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
  children: ReactNode;
}) {
  if (query.isLoading) return <p role="status">Loading…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>Couldn’t load this section.</p>
        <button
          className="btn btn-ghost"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  return <>{children}</>;
}
function More({
  query,
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
}) {
  return query.hasNextPage ? (
    <button
      className="btn btn-ghost"
      disabled={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
    </button>
  ) : null;
}
export function PrepProgress({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="prep-progress">
      <progress aria-label="Checklist completion" value={completed} max={total || 1} />
      <span>
        {total
          ? `${completed}/${total} tasks · ${progress(completed, total)}%`
          : 'No tasks yet · 0%'}
      </span>
    </div>
  );
}
function SaveError({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function PlanForm({
  plan,
  collections,
  onClose,
}: {
  plan?: PreparationPlan;
  collections: Collection[];
  onClose: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? '');
  const [company, setCompany] = useState(plan?.company ?? '');
  const [role, setRole] = useState(plan?.role ?? '');
  const [collectionId, setCollectionId] = useState(plan?.collectionId ?? '');
  const { save, busy, error } = useSave();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await save(plan ? `/plans/${plan.id}` : '/plans', plan ? 'PATCH' : 'POST', {
        name,
        company,
        role,
        collectionId: collectionId || null,
      })
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Plan name
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="prep-form-row">
        <label>
          Company (optional)
          <input maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          Role (optional)
          <input maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
      </div>
      <label>
        Study collection
        <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
          <option value="">No collection</option>
          {collectionId && !collections.some((c) => c.id === collectionId) && (
            <option value={collectionId}>Unavailable collection</option>
          )}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save plan'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function TaskForm({
  planId,
  task,
  onClose,
}: {
  planId: string;
  task?: PreparationTask;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const { save, busy, error } = useSave();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await save(`/plans/${planId}/tasks${task ? `/${task.id}` : ''}`, task ? 'PATCH' : 'POST', {
        title,
        dueDate: dueDate || null,
      })
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Task
        <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Due date (optional)
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          Save task
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function TaskRow({ task }: { task: PreparationTask }) {
  const [editing, setEditing] = useState(false);
  const { save, busy, error } = useSave();
  const path = `/plans/${task.planId}/tasks/${task.id}`;
  if (editing)
    return <TaskForm task={task} planId={task.planId} onClose={() => setEditing(false)} />;
  return (
    <div className="prep-task">
      <label className="prep-check">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={busy}
          onChange={(e) => void save(path, 'PATCH', { completed: e.target.checked })}
        />
        <span className={task.completed ? 'prep-done' : ''}>{task.title}</span>
      </label>
      {task.dueDate && (
        <span className={isOverdue(task.dueDate, task.completed) ? 'error' : 'page-note'}>
          {isOverdue(task.dueDate, task.completed) ? 'Overdue · ' : 'Due '}
          {task.dueDate}
        </span>
      )}
      <div className="prep-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(true)}>
          Edit task
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete this task?')) void save(path, 'DELETE');
          }}
        >
          Delete task
        </button>
      </div>
      <SaveError error={error} />
    </div>
  );
}
function InterviewForm({
  planId,
  interview,
  onClose,
}: {
  planId: string;
  interview?: PreparationInterview;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<PreparationInterview['stage']>(
    interview?.stage ?? 'technical',
  );
  const [time, setTime] = useState(interview ? localDateTime(interview.scheduledAt) : '');
  const [notes, setNotes] = useState(interview?.notes ?? '');
  const [status, setStatus] = useState<PreparationInterview['status']>(
    interview?.status ?? 'scheduled',
  );
  const { save, busy, error } = useSave();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await save(
        `/plans/${planId}/interviews${interview ? `/${interview.id}` : ''}`,
        interview ? 'PATCH' : 'POST',
        { stage, scheduledAt: new Date(time).toISOString(), notes, status },
      )
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Interview stage
        <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
          {Object.entries(INTERVIEW_STAGES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        <input
          required
          type="datetime-local"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label>
        Notes (optional)
        <textarea maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !time}>
          Save interview
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function InterviewRow({ interview }: { interview: PreparationInterview }) {
  const [editing, setEditing] = useState(false);
  const { save, busy, error } = useSave();
  if (editing)
    return (
      <InterviewForm
        planId={interview.planId}
        interview={interview}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <article className="prep-interview">
      <strong>
        {interview.plan?.name ? `${interview.plan.name} · ` : ''}
        {INTERVIEW_STAGES[interview.stage]}
      </strong>
      <p>
        <time dateTime={interview.scheduledAt}>
          {new Date(interview.scheduledAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </time>
      </p>
      <p className="page-note">
        {interview.status}
        {interview.status === 'scheduled' && new Date(interview.scheduledAt) < new Date()
          ? ' · Update status after your interview'
          : ''}
      </p>
      {interview.notes && <p className="prep-notes">{interview.notes}</p>}
      <div className="prep-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(true)}>
          Edit interview
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete this interview?'))
              void save(`/plans/${interview.planId}/interviews/${interview.id}`, 'DELETE');
          }}
        >
          Delete interview
        </button>
      </div>
      <SaveError error={error} />
    </article>
  );
}
function PlanContents({ planId }: { planId: string }) {
  const tasks = usePrepList<PreparationTask>(`/plans/${planId}/tasks`);
  const interviews = usePrepList<PreparationInterview>(`/plans/${planId}/interviews`);
  const [addTask, setAddTask] = useState(false);
  const [addInterview, setAddInterview] = useState(false);
  const taskItems = tasks.data?.pages.flatMap((p) => p.items) ?? [];
  const interviewItems = interviews.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="prep-contents">
      <h4>Checklist</h4>
      <QueryState query={tasks}>
        {!taskItems.length && <p className="page-note">Add your first preparation task.</p>}
        {taskItems.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        <More query={tasks} />
      </QueryState>
      {addTask ? (
        <TaskForm planId={planId} onClose={() => setAddTask(false)} />
      ) : (
        <button className="btn btn-ghost" onClick={() => setAddTask(true)}>
          ＋ Add task
        </button>
      )}
      <h4>Interviews</h4>
      <QueryState query={interviews}>
        {!interviewItems.length && (
          <p className="page-note">No interviews scheduled for this plan.</p>
        )}
        {interviewItems.map((interview) => (
          <InterviewRow key={interview.id} interview={interview} />
        ))}
        <More query={interviews} />
      </QueryState>
      {addInterview ? (
        <InterviewForm planId={planId} onClose={() => setAddInterview(false)} />
      ) : (
        <button className="btn btn-ghost" onClick={() => setAddInterview(true)}>
          ＋ Schedule interview
        </button>
      )}
    </div>
  );
}
export function CollectionLink({
  id,
  collections,
  failed,
}: {
  id: string;
  collections: Collection[];
  failed: boolean;
}) {
  const collection = collections.find((c) => c.id === id);
  return collection ? (
    <Link to={`/collections/${id}`}>Study collection: {collection.name}</Link>
  ) : (
    <p className="page-note">
      {failed
        ? 'Collection details are temporarily unavailable.'
        : 'Unavailable collection — edit this plan to replace or unlink it.'}
    </p>
  );
}
function PlanCard({
  plan,
  collections,
  collectionsFailed,
}: {
  plan: PreparationPlan;
  collections: Collection[];
  collectionsFailed: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { save, busy, error } = useSave();
  return (
    <article className="card prep-plan">
      {editing ? (
        <PlanForm plan={plan} collections={collections} onClose={() => setEditing(false)} />
      ) : (
        <>
          <h3>{plan.name}</h3>
          {(plan.company || plan.role) && (
            <p className="page-note">{[plan.company, plan.role].filter(Boolean).join(' · ')}</p>
          )}
          <PrepProgress completed={plan.completedTasks} total={plan.totalTasks} />
          {plan.collectionId && (
            <CollectionLink
              id={plan.collectionId}
              collections={collections}
              failed={collectionsFailed}
            />
          )}
          <div className="prep-actions">
            <button
              className="btn btn-primary"
              aria-expanded={expanded}
              aria-controls={`plan-${plan.id}`}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide checklist & interviews' : 'Open plan'}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(true)}>
              Edit plan
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${plan.name}”? All its tasks and interviews will also be deleted. Your collection will remain.`,
                  )
                )
                  void save(`/plans/${plan.id}`, 'DELETE');
              }}
            >
              Delete plan
            </button>
          </div>
          <SaveError error={error} />
        </>
      )}
      {expanded && (
        <div id={`plan-${plan.id}`}>
          <PlanContents planId={plan.id} />
        </div>
      )}
    </article>
  );
}
export function DashboardPage() {
  const { me } = useAuth();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const summary = useQuery({
    queryKey: ['preparation', me?.userId, 'summary'],
    queryFn: () => api<PreparationSummary>(`${base}/summary`),
    enabled: !!me,
  });
  const plans = usePrepList<PreparationPlan>('/plans');
  const interviews = usePrepList<PreparationInterview>(`/interviews?view=${view}`);
  const collections = useQuery({
    queryKey: ['preparation-collections', me?.userId],
    queryFn: () => api<{ items: Collection[] }>('/api/collections'),
    enabled: !!me,
  });
  const planItems = plans.data?.pages.flatMap((p) => p.items) ?? [];
  const interviewItems = interviews.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="prep-dashboard">
      <header className="prep-heading">
        <div>
          <p className="page-note">Your private preparation space</p>
          <h1>My preparation</h1>
          <p>Turn your next opportunity into a plan.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ New plan
        </button>
      </header>
      <section className="card">
        <h2>Target roles</h2>
        <div className="tags">
          {me?.targetRoles.length ? (
            me.targetRoles.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))
          ) : (
            <p className="page-note">Add target roles to focus your preparation.</p>
          )}
        </div>
        <Link to="/settings/profile">Edit target roles</Link>
      </section>
      <section className="card" aria-label="Preparation overview">
        <QueryState query={summary}>
          {summary.data && (
            <>
              <h2>
                {summary.data.planCount} preparation{' '}
                {summary.data.planCount === 1 ? 'plan' : 'plans'}
              </h2>
              <PrepProgress
                completed={summary.data.completedTasks}
                total={summary.data.totalTasks}
              />
              <p>
                {summary.data.nextInterview
                  ? `Next interview: ${summary.data.nextInterview.plan?.name} · ${new Date(summary.data.nextInterview.scheduledAt).toLocaleString()}`
                  : 'No upcoming interviews. Schedule one inside a plan.'}
              </p>
            </>
          )}
        </QueryState>
      </section>
      <div className="prep-layout">
        <section aria-labelledby="prep-plans-title">
          <h2 id="prep-plans-title">Your plans</h2>
          {creating && (
            <section className="card">
              <h3>New preparation plan</h3>
              <PlanForm
                collections={collections.data?.items ?? []}
                onClose={() => setCreating(false)}
              />
            </section>
          )}
          {collections.isError && (
            <div role="alert">
              <p>Collections couldn’t be loaded. You can still work on your plans.</p>
              <button className="btn btn-ghost" onClick={() => void collections.refetch()}>
                Retry collections
              </button>
            </div>
          )}
          <QueryState query={plans}>
            {!planItems.length && (
              <div className="card">
                <h3>Start with one goal</h3>
                <p>
                  Create a plan for a company, role, or topic, then add a checklist and study
                  collection.
                </p>
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  Create your first plan
                </button>
              </div>
            )}
            {planItems.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                collections={collections.data?.items ?? []}
                collectionsFailed={collections.isError || collections.isLoading}
              />
            ))}
            <More query={plans} />
          </QueryState>
        </section>
        <aside className="card prep-schedule" aria-labelledby="prep-schedule-title">
          <h2 id="prep-schedule-title">Interview schedule</h2>
          <p className="page-note">
            Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <div className="prep-actions">
            <button
              className={`btn ${view === 'upcoming' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={view === 'upcoming'}
              onClick={() => setView('upcoming')}
            >
              Upcoming
            </button>
            <button
              className={`btn ${view === 'past' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={view === 'past'}
              onClick={() => setView('past')}
            >
              Past & closed
            </button>
          </div>
          <QueryState query={interviews}>
            {!interviewItems.length && (
              <p className="page-note">
                {view === 'upcoming'
                  ? 'No upcoming interviews. Open a plan to schedule one.'
                  : 'No past or closed interviews yet.'}
              </p>
            )}
            {interviewItems.map((interview) => (
              <InterviewRow key={interview.id} interview={interview} />
            ))}
            <More query={interviews} />
          </QueryState>
        </aside>
      </div>
    </div>
  );
}
