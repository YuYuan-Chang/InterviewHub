import { useState, type FormEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { More, QueryState, SaveError, useSave } from './Preparation';
import type { Page, PreparationQuestion } from '../types';

type Readiness = PreparationQuestion['readiness'];
type QuestionPage = Page<PreparationQuestion> & {
  totals: Record<Readiness, number>;
};
const labels = { new: 'New', practicing: 'Practicing', ready: 'Ready' };

export function QuestionForm({
  planId,
  question,
  onClose,
}: {
  planId: string;
  question?: PreparationQuestion;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [answer, setAnswer] = useState(question?.answer ?? '');
  const [readiness, setReadiness] = useState<Readiness>(
    question?.readiness ?? 'new',
  );
  const { save, busy, error } = useSave();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await save(
        `/plans/${planId}/questions${question ? `/${question.id}` : ''}`,
        question ? 'PATCH' : 'POST',
        { prompt, answer, readiness },
      )
    )
      onClose();
  }
  return (
    <form className="prep-form" onSubmit={submit}>
      <label>
        Question
        <textarea
          required
          rows={3}
          maxLength={5000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <label>
        Draft answer
        <textarea
          rows={8}
          maxLength={20000}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <label>
        Readiness
        <select
          value={readiness}
          onChange={(e) => setReadiness(e.target.value as Readiness)}
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <SaveError error={error} />
      <div className="prep-actions">
        <button className="btn btn-primary" disabled={busy || !prompt.trim()}>
          Save question
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
function QuestionRow({ question }: { question: PreparationQuestion }) {
  const [editing, setEditing] = useState(false);
  const { save, busy, error } = useSave();
  if (editing)
    return (
      <QuestionForm
        planId={question.planId}
        question={question}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <article className="workspace-question">
      <h3 className="prep-notes">{question.prompt}</h3>
      <span className="page-note">{labels[question.readiness]}</span>
      <p className="prep-notes">{question.answer || 'No draft answer yet.'}</p>
      <div className="prep-actions">
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>
          Edit question
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete this question and its draft answer?'))
              void save(
                `/plans/${question.planId}/questions/${question.id}`,
                'DELETE',
              );
          }}
        >
          Delete question
        </button>
      </div>
      <SaveError error={error} />
    </article>
  );
}
export function WorkspaceQuestions({ planId }: { planId: string }) {
  const { me } = useAuth();
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['preparation', me?.userId, 'questions', planId, filter],
    queryFn: ({ pageParam }) =>
      api<QuestionPage>(
        `/api/users/me/preparation/plans/${planId}/questions?cursor=${encodeURIComponent(pageParam)}${filter ? `&readiness=${filter}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const totals = query.data?.pages[0]?.totals;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section>
      <h2>Practice questions</h2>
      <p className="page-note">
        Private questions and draft answers for this interview.
      </p>
      {totals && (
        <p>
          {totals.new} new · {totals.practicing} practicing · {totals.ready}{' '}
          ready
        </p>
      )}
      <label>
        Filter by readiness{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All questions</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <QueryState query={query}>
        {items.length ? (
          items.map((question) => (
            <QuestionRow key={question.id} question={question} />
          ))
        ) : (
          <p>
            No questions{filter ? ' with this readiness' : ' yet'}. Add one to
            start practicing.
          </p>
        )}
        <More query={query} />
      </QueryState>
      {adding ? (
        <QuestionForm planId={planId} onClose={() => setAdding(false)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          Add question
        </button>
      )}
    </section>
  );
}
