import { useSearchParams } from 'react-router-dom';
import { EXPERIENCE_FILTER_KEYS, INTERVIEW_STAGES, INTERVIEW_DIFFICULTIES, INTERVIEW_OUTCOMES } from '../interview';

export function ExperienceFilters() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === 'type' && value !== 'experience') {
      for (const filter of EXPERIENCE_FILTER_KEYS) next.delete(filter);
    }
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    setParams(next, { replace: true });
  }

  return (
    <div className="experience-filters">
      <label>Post type
        <select value={type} onChange={(e) => update('type', e.target.value)}>
          <option value="">All posts</option>
          <option value="material">Prep materials</option>
          <option value="experience">Interview experiences</option>
        </select>
      </label>
      {type === 'experience' && (
        <>
          <div className="experience-form-grid">
            <label>Company
              <input value={params.get('company') ?? ''} maxLength={120} placeholder="Any company" onChange={(e) => update('company', e.target.value)} />
            </label>
            <label>Role
              <input value={params.get('role') ?? ''} maxLength={120} placeholder="Any role" onChange={(e) => update('role', e.target.value)} />
            </label>
            {([
              ['stage', 'Stage', INTERVIEW_STAGES],
              ['difficulty', 'Difficulty', INTERVIEW_DIFFICULTIES],
              ['outcome', 'Outcome', INTERVIEW_OUTCOMES],
            ] as const).map(([key, label, options]) => (
              <label key={key}>{label}
                <select value={params.get(key) ?? ''} onChange={(e) => update(key, e.target.value)}>
                  <option value="">Any {label.toLowerCase()}</option>
                  {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </label>
            ))}
          </div>
          {EXPERIENCE_FILTER_KEYS.some((key) => key !== 'type' && params.has(key)) && (
            <button className="btn-link" onClick={() => {
              const next = new URLSearchParams(params);
              for (const key of EXPERIENCE_FILTER_KEYS) if (key !== 'type') next.delete(key);
              next.delete('cursor');
              setParams(next, { replace: true });
            }}>Clear interview filters</button>
          )}
        </>
      )}
    </div>
  );
}
