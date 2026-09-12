import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreparationWorkspacePage } from '../src/pages/PreparationWorkspacePage';
import { ApiError } from '../src/api';

const { state } = vi.hoisted(() => ({
  state: { tab: 'overview', missing: false, resourcesFailed: false },
}));
vi.mock('../src/auth', () => ({
  useAuth: () => ({ me: { userId: 'alice' } }),
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useParams: () => ({ planId: 'plan-1' }),
  useSearchParams: () => [new URLSearchParams({ tab: state.tab })],
}));
const plan = {
  id: 'plan-1',
  name: 'Backend interview',
  company: 'Example',
  role: 'Engineer',
  jobUrl: 'https://example.com/jobs',
  jobDescription: 'Build APIs',
  notes: 'Review trade-offs',
  collectionId: 'collection-1',
  completedTasks: 1,
  totalTasks: 2,
};
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const workspace = queryKey.includes('workspace');
    const resources = queryKey[0] === 'preparation-collections';
    return {
      isLoading: false,
      isError: resources && state.resourcesFailed,
      error: workspace && state.missing ? new ApiError(404, 'Not found') : null,
      refetch: vi.fn(),
      data: workspace
        ? state.missing
          ? undefined
          : plan
        : {
            items: resources
              ? [{ id: 'collection-1', name: 'Study', isPrivate: true }]
              : [],
          },
    };
  },
  useInfiniteQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isLoading: false,
    isError: queryKey[0] === 'collection-posts' && state.resourcesFailed,
    refetch: vi.fn(),
    data: {
      pages: [{ items: [], totals: { new: 2, practicing: 1, ready: 3 } }],
    },
  }),
}));
const render = () =>
  renderToStaticMarkup(
    createElement(StaticRouter, {}, createElement(PreparationWorkspacePage)),
  );
beforeEach(() => {
  state.tab = 'overview';
  state.missing = false;
  state.resourcesFailed = false;
});

describe('interview workspace', () => {
  it('renders a directly opened plan with all section links and overview data', () => {
    const html = render();
    expect(html).toContain('Backend interview');
    expect(html).toContain('1/2 tasks');
    expect(html).toContain('Review trade-offs');
    for (const tab of [
      'overview',
      'tasks',
      'resources',
      'questions',
      'interviews',
    ])
      expect(html).toContain(`?tab=${tab}`);
  });
  it('selects question content from the URL and shows readiness totals', () => {
    state.tab = 'questions';
    const html = render();
    expect(html).toContain('2 new · 1 practicing · 3 ready');
    expect(html).toContain('Add question');
    expect(html).not.toContain('Edit overview');
  });
  it('retains task and interview creation in their respective tabs', () => {
    state.tab = 'tasks';
    expect(render()).toContain('Add task');
    state.tab = 'interviews';
    expect(render()).toContain('Schedule interview');
  });
  it('offers resource retry and unlinking while other sections remain available', () => {
    state.tab = 'resources';
    state.resourcesFailed = true;
    expect(render()).toContain('Try again');
    expect(render()).toContain('Unlink collection');
    state.tab = 'tasks';
    expect(render()).toContain('Add task');
  });
  it('shows an inaccessible plan state without leaking its contents', () => {
    state.missing = true;
    expect(render()).toContain('Preparation plan unavailable');
    expect(render()).not.toContain('Backend interview');
  });
  it('falls back to overview for an unknown tab', () => {
    state.tab = 'unknown';
    expect(render()).toContain('Edit overview');
  });
});
