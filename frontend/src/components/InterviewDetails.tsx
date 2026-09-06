import { Link } from 'react-router-dom';
import { INTERVIEW_STAGES, INTERVIEW_DIFFICULTIES, INTERVIEW_OUTCOMES, type InterviewExperience } from '../interview';

export function InterviewDetails({ experience, expanded = false }: { experience: InterviewExperience; expanded?: boolean }) {
  return (
    <section className="interview-details" aria-label="Interview experience">
      <span className="experience-badge">Interview experience</span>
      <dl className="interview-facts">
        <div><dt>Company</dt><dd><Link to={`/?type=experience&company=${encodeURIComponent(experience.company)}`}>{experience.company}</Link></dd></div>
        <div><dt>Role</dt><dd>{experience.role}</dd></div>
        <div><dt>Stage</dt><dd>{INTERVIEW_STAGES[experience.stage]}</dd></div>
        <div><dt>Difficulty</dt><dd>{INTERVIEW_DIFFICULTIES[experience.difficulty]}</dd></div>
        <div><dt>Outcome</dt><dd>{INTERVIEW_OUTCOMES[experience.outcome]}</dd></div>
      </dl>
      {expanded ? (
        <div className="interview-questions"><h4>Questions asked</h4><p>{experience.questions}</p></div>
      ) : (
        <details className="interview-questions"><summary>Questions asked</summary><p>{experience.questions}</p></details>
      )}
    </section>
  );
}
