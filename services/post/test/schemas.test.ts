import { describe, expect, it } from 'vitest';
import { createPostSchema } from '../src/schemas';

const details = {
  company: ' Example Corp ', role: ' Software engineer ', stage: 'technical',
  questions: ' Design an LRU cache.\nHow would you test it? ', difficulty: 'hard', outcome: 'pending',
};
const experience = { title: 'My interview experience', type: 'experience', interviewExperience: details };

describe('post creation contract', () => {
  it('keeps legacy material requests valid, including single-file attachments', () => {
    const fileId = '5f78a7b3-b7b4-4c8c-892c-572880e5896a';
    expect(createPostSchema.parse({ title: 'Prep notes', fileId })).toMatchObject({
      type: 'material', fileId, fileIds: [], tags: [], description: '',
    });
  });

  it('preserves resume text through the shared post validator', () => {
    expect(createPostSchema.parse({ title: 'Review my resume', resumeText: '# Alex\r\nExperience' })).toMatchObject({
      type: 'material', resumeText: '# Alex\nExperience',
    });
  });

  it('rejects invalid resume text when creating a post', () => {
    for (const resumeText of ['   ', 'x'.repeat(20001), 'x\n'.repeat(501)]) {
      expect(createPostSchema.safeParse({ title: 'Review my resume', resumeText }).success).toBe(false);
    }
  });

  it('normalizes interview text while preserving question line breaks', () => {
    expect(createPostSchema.parse(experience).interviewExperience).toMatchObject({
      company: 'Example Corp', role: 'Software engineer', questions: 'Design an LRU cache.\nHow would you test it?',
    });
  });

  it('requires interview details and rejects accidentally attaching them to materials', () => {
    expect(createPostSchema.safeParse({ title: 'Experience', type: 'experience' }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...experience, type: 'material' }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...experience, type: undefined }).success).toBe(false);
  });

  it.each(['company', 'role', 'questions'])('rejects blank or missing %s', (field) => {
    for (const value of ['   ', undefined]) {
      expect(createPostSchema.safeParse({ ...experience, interviewExperience: { ...details, [field]: value } }).success).toBe(false);
    }
  });

  it.each(['stage', 'difficulty', 'outcome'])('rejects unsupported or missing %s', (field) => {
    for (const value of ['invalid', undefined]) {
      expect(createPostSchema.safeParse({ ...experience, interviewExperience: { ...details, [field]: value } }).success).toBe(false);
    }
  });

  it('enforces length limits on interview content', () => {
    for (const [field, limit] of [['company', 120], ['role', 120], ['questions', 5000]] as const) {
      expect(createPostSchema.safeParse({ ...experience, interviewExperience: { ...details, [field]: 'x'.repeat(limit + 1) } }).success).toBe(false);
    }
  });
});
