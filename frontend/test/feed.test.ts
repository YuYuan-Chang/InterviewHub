import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedPage } from '../src/pages/FeedPage';

const { state } = vi.hoisted(() => ({
  state: {
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    hasNextPage: false,
    data: { pages: [{ items: [] }] },
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({ ...state, refetch: vi.fn() }),
  useQuery: () => ({ data: { tags: [{ tag: 'resume', count: 2 }] } }),
}));
vi.mock('../src/auth', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../src/components/PostCard', () => ({ PostCard: () => null }));

function render(location = '/', mode: 'explore' | 'following' = 'explore') {
  return renderToStaticMarkup(createElement(StaticRouter, { location }, createElement(FeedPage, { mode })));
}

beforeEach(() => {
  state.isLoading = false;
  state.isError = false;
  state.isSuccess = true;
});

describe('Feed feedback', () => {
  it('offers retry without claiming the feed is empty after a failed request', () => {
    state.isError = true;
    state.isSuccess = false;
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Be the first to share');
  });

  it('announces loading without showing an empty result', () => {
    state.isLoading = true;
    state.isSuccess = false;
    const html = render();
    expect(html).toContain('aria-label="Loading posts"');
    expect(html).not.toContain('Be the first to share');
  });

  it('offers a filter reset when a successful query has no matching resources', () => {
    const html = render('/?tags=resume');
    expect(html).toContain('No resources match these topics');
    expect(html).toContain('Clear filters');
    expect(html).toContain('aria-pressed="true"');
  });

  it('keeps every selected topic removable even when more than fourteen are in the URL', () => {
    const tags = Array.from({ length: 16 }, (_, index) => `topic-${index}`);
    const html = render(`/?tags=${tags.join(',')}`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(16);
    expect(html).toContain('topic-15');
  });

  it('helps users discover authors when their following feed is empty', () => {
    const html = render('/following', 'following');
    expect(html).toContain('Build your prep circle');
    expect(html).toContain('Explore resources');
    expect(html).not.toContain('No resources match');
  });
});
