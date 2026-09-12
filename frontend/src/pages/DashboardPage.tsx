import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { INTERVIEW_STAGES } from '../interview';
import type {
  Collection,
  PreparationPlan,
  PreparationSummary,
  PreparationInterview,
} from '../types';
import {
  usePrepList,
  useSave,
  QueryState,
  More,
  SaveError,
  PlanForm,
  InterviewRow,
  PrepProgress,
  CollectionLink,
} from '../components/Preparation';
export { PrepProgress, CollectionLink } from '../components/Preparation';
const base = '/api/users/me/preparation';
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
  const { save, busy, error } = useSave();
  return (
    <article className="card prep-plan">
      {editing ? (
        <PlanForm
          plan={plan}
          collections={collections}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <h3>{plan.name}</h3>
          {(plan.company || plan.role) && (
            <p className="page-note">
              {[plan.company, plan.role].filter(Boolean).join(' · ')}
            </p>
          )}
          <PrepProgress
            completed={plan.completedTasks}
            total={plan.totalTasks}
          />
          {plan.collectionId && (
            <CollectionLink
              id={plan.collectionId}
              collections={collections}
              failed={collectionsFailed}
            />
          )}
          <div className="prep-actions">
            <Link
              className="btn btn-primary"
              to={`/dashboard/plans/${plan.id}`}
            >
              Open plan
            </Link>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit plan
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${plan.name}”? All its tasks, questions, and interviews will also be deleted. Your collection will remain.`,
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
  const interviews = usePrepList<PreparationInterview>(
    `/interviews?view=${view}`,
  );
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
            <p className="page-note">
              Add target roles to focus your preparation.
            </p>
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
              <p>
                Collections couldn’t be loaded. You can still work on your
                plans.
              </p>
              <button
                className="btn btn-ghost"
                onClick={() => void collections.refetch()}
              >
                Retry collections
              </button>
            </div>
          )}
          <QueryState query={plans}>
            {!planItems.length && (
              <div className="card">
                <h3>Start with one goal</h3>
                <p>
                  Create a plan for a company, role, or topic, then add a
                  checklist and study collection.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => setCreating(true)}
                >
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
        <aside
          className="card prep-schedule"
          aria-labelledby="prep-schedule-title"
        >
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
