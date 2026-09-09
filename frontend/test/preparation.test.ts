import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isOverdue, localDateTime, progress } from '../src/preparation';
import { CollectionLink, DashboardPage, PrepProgress } from '../src/pages/DashboardPage';
const { state } = vi.hoisted(() => ({ state: { isLoading: false, isError: false } }));
vi.mock('../src/auth', () => ({
  useAuth: () => ({ me: { userId: 'alice', targetRoles: ['Backend engineer'] } }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ ...state, data: undefined, refetch: vi.fn() }),
  useInfiniteQuery: () => ({ ...state, data: undefined, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
beforeEach(() => {
  state.isLoading = false;
  state.isError = false;
});
const render = () =>
  renderToStaticMarkup(createElement(StaticRouter, {}, createElement(DashboardPage)));
describe('preparation dashboard', () => {
  it('invites a new user to create a plan and shows existing target roles', () => {
    const html = render();
    expect(html).toContain('Create your first plan');
    expect(html).toContain('Backend engineer');
    expect(html).toContain('Your private preparation space');
  });
  it('shows loading rather than an empty dashboard', () => {
    state.isLoading = true;
    expect(render()).toContain('Loading…');
    expect(render()).not.toContain('Create your first plan');
  });
  it('offers retry on failed sections rather than empty results', () => {
    state.isError = true;
    expect(render()).toContain('Try again');
    expect(render()).not.toContain('Create your first plan');
  });
  it('shows explicit zero progress for an empty checklist', () => {
    expect(progress(0, 0)).toBe(0);
    expect(progress(1, 3)).toBe(33);
    expect(renderToStaticMarkup(createElement(PrepProgress, { completed: 0, total: 0 }))).toContain(
      'No tasks yet · 0%',
    );
  });
  it('distinguishes a deleted collection from an unavailable service', () => {
    expect(
      renderToStaticMarkup(
        createElement(CollectionLink, { id: 'gone', collections: [], failed: false }),
      ),
    ).toContain('replace or unlink');
    expect(
      renderToStaticMarkup(
        createElement(CollectionLink, { id: 'gone', collections: [], failed: true }),
      ),
    ).toContain('temporarily unavailable');
  });
  it('marks only incomplete tasks before today overdue', () => {
    expect(isOverdue('2026-09-08', false, '2026-09-09')).toBe(true);
    expect(isOverdue('2026-09-09', false, '2026-09-09')).toBe(false);
    expect(isOverdue('2026-09-08', true, '2026-09-09')).toBe(false);
    expect(isOverdue(null, false)).toBe(false);
  });
  it('converts an instant to the local datetime input and back', () => {
    const instant = '2026-09-10T01:30:00.000Z';
    expect(new Date(localDateTime(instant)).toISOString()).toBe(instant);
  });
});
