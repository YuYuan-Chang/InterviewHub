import { z } from 'zod';

export const postTypeSchema = z.enum(['material', 'experience']);
export const stageSchema = z.enum(['recruiter_screen', 'online_assessment', 'technical', 'system_design', 'behavioral', 'onsite', 'other']);
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export const outcomeSchema = z.enum(['offer', 'rejected', 'pending', 'withdrew', 'prefer_not_to_say']);

export const interviewExperienceSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  stage: stageSchema,
  questions: z.string().trim().min(1).max(5000),
  difficulty: difficultySchema,
  outcome: outcomeSchema,
});

export const createPostSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().max(5000).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(60).transform((t) => t.toLowerCase())).max(8).optional().default([]),
  fileId: z.string().uuid().optional(), // legacy single-file clients
  fileIds: z.array(z.string().uuid()).max(8).optional().default([]),
  type: postTypeSchema.optional().default('material'),
  interviewExperience: interviewExperienceSchema.optional(),
}).superRefine((post, ctx) => {
  if (post.type === 'experience' && !post.interviewExperience) {
    ctx.addIssue({ code: 'custom', path: ['interviewExperience'], message: 'Interview details are required for an experience.' });
  }
  if (post.type === 'material' && post.interviewExperience) {
    ctx.addIssue({ code: 'custom', path: ['interviewExperience'], message: 'Interview details are only allowed on experiences.' });
  }
});
