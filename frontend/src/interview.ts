export const INTERVIEW_STAGES = {
  recruiter_screen: 'Recruiter screen',
  online_assessment: 'Online assessment',
  technical: 'Technical interview',
  system_design: 'System design',
  behavioral: 'Behavioral interview',
  onsite: 'Onsite / final round',
  other: 'Other',
};
export const INTERVIEW_DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const INTERVIEW_OUTCOMES = {
  offer: 'Received an offer',
  rejected: 'Rejected',
  pending: 'Awaiting a decision',
  withdrew: 'Withdrew',
  prefer_not_to_say: 'Prefer not to say',
};

export interface InterviewExperience {
  company: string;
  role: string;
  stage: keyof typeof INTERVIEW_STAGES;
  questions: string;
  difficulty: keyof typeof INTERVIEW_DIFFICULTIES;
  outcome: keyof typeof INTERVIEW_OUTCOMES;
}

export const EXPERIENCE_FILTER_KEYS = ['type', 'company', 'role', 'stage', 'difficulty', 'outcome'] as const;

export function experienceFilterParams(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of EXPERIENCE_FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) result.set(key, value);
  }
  return result;
}
