import { describe, expect, it } from 'vitest';
import { applyPatch, createTwoFilesPatch } from 'diff';
import { prepareRevision, resumeTextSchema, revisionSchema } from '../src/resume';

const base = '# Alex\n\nExperience\n- Built an API\n';
const improved = '# Alex\n\nExperience\n- Built an API serving 1,000 daily users\n';

describe('resume revisions', () => {
  it('exports a unified patch that round-trips the proposed resume', () => {
    const revision = prepareRevision(base, { proposedText: improved });
    expect(revision.patch).toContain('--- a/resume.md');
    expect(revision.patch).toContain('-\u0020Built an API');
    expect(applyPatch(base, revision.patch)).toBe(improved);
  });

  it('imports a patch and normalizes Windows newlines', () => {
    const patch = createTwoFilesPatch('resume.md', 'resume.md', base, improved).replace(/\n/g, '\r\n');
    expect(prepareRevision(base, { patch }).proposedText).toBe(improved);
    expect(resumeTextSchema.parse('a\r\nb\r\n')).toBe('a\nb\n');
  });

  it('preserves Unicode, blank lines and missing terminal newline', () => {
    const text = '# 張同學\n\n- Improved latency by 30%';
    const revision = prepareRevision(base, { proposedText: text });
    expect(applyPatch(base, revision.patch)).toBe(text);
    expect(prepareRevision(base, { patch: revision.patch }).proposedText).toBe(text);
  });

  it('rejects unchanged, blank, oversized and excessive-line resumes', () => {
    for (const proposedText of [base, '  \n ', 'x'.repeat(20001), 'x\n'.repeat(501)]) {
      expect(() => prepareRevision(base, { proposedText })).toThrow();
    }
  });

  it('rejects malformed, mismatched and multiple-file patches', () => {
    const patch = createTwoFilesPatch('resume.md', 'resume.md', base, improved);
    for (const input of ['garbage', patch.replace('Built an API', 'Wrote a book'), patch + patch, '@@ -1,5 +1,1 @@\n-x\n+y\n']) {
      expect(() => prepareRevision(base, { patch: input })).toThrow();
    }
  });

  it('validates the result of an imported patch, including deletion of the whole resume', () => {
    const patch = createTwoFilesPatch('resume.md', 'resume.md', base, '');
    expect(() => prepareRevision(base, { patch })).toThrow();
  });

  it('requires exactly one input, a real summary and a positive base version', () => {
    const input = { baseVersion: 1, summary: 'Clarify impact', proposedText: improved };
    expect(revisionSchema.safeParse(input).success).toBe(true);
    for (const invalid of [{ ...input, patch: 'patch' }, { ...input, proposedText: undefined }, { ...input, summary: ' ' }, { ...input, baseVersion: 0 }]) {
      expect(revisionSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
