import { useState, type FormEvent, type ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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
  PreparationTask,
} from '../types';

const base = '/api/users/me/preparation';
export function usePrepList<T>(path: string) {
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
export function useSave() {
  const { me } = useAuth();
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await api(`${base}${path}`, { method, body });
      await cache.invalidateQueries({ queryKey: ['preparation', me?.userId] });
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save. Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, error, busy };
}
export function QueryState({
  query,
  children,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
    refetch: () => unknown;
  };
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
export function More({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
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
export function PrepProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <div className="prep-progress">
      <progress
        aria-label="Checklist completion"
        value={completed}
        max={total || 1}
      />
      <span>
        {total
          ? `${completed}/${total} tasks · ${progress(completed, total)}%`
          : 'No tasks yet · 0%'}
      </span>
    </div>
  );
}
export function SaveError({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function PlanForm({
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
      await save(
        plan ? `/plans/${plan.id}` : '/plans',
        plan ? 'PATCH' : 'POST',
        {
          name,
          company,
          role,
          collectionId: collectionId || null,
        },
      )
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Plan name
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="prep-form-row">
        <label>
          Company (optional)
          <input
            maxLength={120}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label>
          Role (optional)
          <input
            maxLength={120}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </label>
      </div>
      <label>
        Study collection
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
        >
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
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function TaskForm({
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
      await save(
        `/plans/${planId}/tasks${task ? `/${task.id}` : ''}`,
        task ? 'PATCH' : 'POST',
        {
          title,
          dueDate: dueDate || null,
        },
      )
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Task
        <input
          required
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Due date (optional)
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          Save task
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function TaskRow({ task }: { task: PreparationTask }) {
  const [editing, setEditing] = useState(false);
  const { save, busy, error } = useSave();
  const path = `/plans/${task.planId}/tasks/${task.id}`;
  if (editing)
    return (
      <TaskForm
        task={task}
        planId={task.planId}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <div className="prep-task">
      <label className="prep-check">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={busy}
          onChange={(e) =>
            void save(path, 'PATCH', { completed: e.target.checked })
          }
        />
        <span className={task.completed ? 'prep-done' : ''}>{task.title}</span>
      </label>
      {task.dueDate && (
        <span
          className={
            isOverdue(task.dueDate, task.completed) ? 'error' : 'page-note'
          }
        >
          {isOverdue(task.dueDate, task.completed) ? 'Overdue · ' : 'Due '}
          {task.dueDate}
        </span>
      )}
      <div className="prep-actions">
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
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
export function InterviewForm({
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
  const [time, setTime] = useState(
    interview ? localDateTime(interview.scheduledAt) : '',
  );
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
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as typeof stage)}
        >
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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label>
        Notes (optional)
        <textarea
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !time}>
          Save interview
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function InterviewRow({
  interview,
}: {
  interview: PreparationInterview;
}) {
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
        {interview.status === 'scheduled' &&
        new Date(interview.scheduledAt) < new Date()
          ? ' · Update status after your interview'
          : ''}
      </p>
      {interview.notes && <p className="prep-notes">{interview.notes}</p>}
      <div className="prep-actions">
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Edit interview
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete this interview?'))
              void save(
                `/plans/${interview.planId}/interviews/${interview.id}`,
                'DELETE',
              );
          }}
        >
          Delete interview
        </button>
      </div>
      <SaveError error={error} />
    </article>
  );
}
export function PlanContents({
  planId,
  section,
}: {
  planId: string;
  section: 'tasks' | 'interviews';
}) {
  const tasks = usePrepList<PreparationTask>(`/plans/${planId}/tasks`);
  const interviews = usePrepList<PreparationInterview>(
    `/plans/${planId}/interviews`,
  );
  const [addTask, setAddTask] = useState(false);
  const [addInterview, setAddInterview] = useState(false);
  const taskItems = tasks.data?.pages.flatMap((p) => p.items) ?? [];
  const interviewItems = interviews.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="prep-contents">
      {section === 'tasks' && (
        <>
          <h2>Checklist</h2>
          <QueryState query={tasks}>
            {!taskItems.length && (
              <p className="page-note">Add your first preparation task.</p>
            )}
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
        </>
      )}
      {section === 'interviews' && (
        <>
          <h2>Interviews</h2>
          <QueryState query={interviews}>
            {!interviewItems.length && (
              <p className="page-note">
                No interviews scheduled for this plan.
              </p>
            )}
            {interviewItems.map((interview) => (
              <InterviewRow key={interview.id} interview={interview} />
            ))}
            <More query={interviews} />
          </QueryState>
          {addInterview ? (
            <InterviewForm
              planId={planId}
              onClose={() => setAddInterview(false)}
            />
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => setAddInterview(true)}
            >
              ＋ Schedule interview
            </button>
          )}
        </>
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
