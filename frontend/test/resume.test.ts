import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffView, ResumeReview } from '../src/components/ResumeReview';
import type { Post } from '../src/types';

const { state } = vi.hoisted(() => ({ state: { viewer: 'owner' as string | null, version: 1, status: 'pending', isError: false } }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ me: state.viewer ? { userId: state.viewer } : null }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({
    isSuccess: !state.isError, isError: state.isError, refetch: vi.fn(),
    data: state.isError ? undefined : { pages: [{ items: [{ id: 'revision', authorId: 'peer', baseVersion: state.version, status: state.status, summary: 'Add measurable impact', patch: '--- a/resume.md\n+++ b/resume.md\n-old\n+new\n', createdAt: '2026-09-06T00:00:00Z', author: null }] }] },
  }),
}));
const post = { id: 'resume', authorId: 'owner', resumeText: '<script>alert(1)</script>\nExperience', resumeVersion: 1, attachments: [] } as unknown as Post;
function render() {
  return renderToStaticMarkup(createElement(StaticRouter, {}, createElement(ResumeReview, { post })));
}
beforeEach(() => { state.viewer = 'owner'; state.version = 1; state.status = 'pending'; state.isError = false; });

describe('resume review display', () => {
  it('shows owner decisions only for pending proposals', () => {
    expect(render()).toContain('Accept changes');
    state.status = 'accepted';
    expect(render()).not.toContain('Accept changes');
    expect(render()).not.toContain('>Reject<');
  });
  it('allows peers to propose but does not expose owner decisions', () => {
    state.viewer = 'peer';
    expect(render()).toContain('Propose a revision');
    expect(render()).not.toContain('Accept changes');
  });
  it('invites anonymous readers to log in', () => {
    state.viewer = null;
    expect(render()).toContain('Log in');
    expect(render()).not.toContain('Propose a revision');
  });
  it('disables acceptance of outdated proposals', () => {
    state.version = 2;
    const html = render();
    expect(html).toContain('Outdated');
    expect(html).toMatch(/disabled="">Accept changes/);
    expect(html).toContain('>Reject<');
  });
  it('renders resume and diff content as escaped text', () => {
    expect(render()).toContain('&lt;script&gt;');
    const html = renderToStaticMarkup(createElement(DiffView, { patch: '-<img src=x onerror=alert(1)>\n+safer text' }));
    expect(html).toContain('diff-remove');
    expect(html).toContain('diff-add');
    expect(html).not.toContain('<img');
  });
  it('distinguishes a failed history request from an empty history', () => {
    state.isError = true;
    expect(render()).toContain('Try again');
    expect(render()).not.toContain('No revisions yet');
  });
});
