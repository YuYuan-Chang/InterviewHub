import { applyPatch, createTwoFilesPatch, parsePatch } from 'diff';
import { z } from 'zod';
import { HttpError } from '@interviewhub/shared';

export const normalizeResume = (text: string): string => text.replace(/\r\n?/g, '\n');
export const resumeTextSchema = z.string().max(20000).transform(normalizeResume)
  .refine((text) => text.trim().length > 0, 'Resume text cannot be blank')
  .refine((text) => text.split('\n').length <= 500, 'Resume must have at most 500 lines');

export const revisionSchema = z.object({
  baseVersion: z.number().int().positive(),
  summary: z.string().trim().min(3).max(1000),
  proposedText: resumeTextSchema.optional(),
  patch: z.string().min(1).max(100000).optional(),
}).refine((data) => (data.proposedText !== undefined) !== (data.patch !== undefined),
  'Provide either revised text or a patch');

/** Patches are applied to a string only, never to filesystem paths. */
export function prepareRevision(base: string, input: { proposedText?: string; patch?: string }) {
  let proposedText = input.proposedText;
  if (input.patch !== undefined) {
    try {
      const patches = parsePatch(normalizeResume(input.patch));
      if (patches.length !== 1 || patches[0].hunks.length === 0) throw new Error('Expected one file');
      const result = applyPatch(base, patches[0], { fuzzFactor: 0 });
      if (result === false) throw new Error('Context mismatch');
      proposedText = result;
    } catch {
      throw new HttpError(400, 'Upload a single-file unified diff that matches the current resume');
    }
  }
  const parsed = resumeTextSchema.safeParse(proposedText);
  if (!parsed.success) throw new HttpError(400, 'Revised resume must contain text, at most 20,000 characters and 500 lines');
  if (parsed.data === base) throw new HttpError(400, 'The revision does not change the resume');
  return {
    proposedText: parsed.data,
    patch: createTwoFilesPatch('a/resume.md', 'b/resume.md', base, parsed.data),
  };
}
