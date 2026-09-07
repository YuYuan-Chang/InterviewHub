import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedPage } from '../src/pages/SavedPage';

const { state, collections } = vi.hoisted(() => ({
  state: {
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    hasNextPage: false,
    data: { pages: [{ items: [] }] },
  },
  collections: { data: { items: [] as { id: string; name: string; itemCount: number; isPrivate: boolean }[] }, isLoading: false },
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({ ...state, refetch: vi.fn(), fetchNextPage: vi.fn() }),
  useQuery: () => collections,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../src/components/PostCard', () => ({ PostCard: () => null }));

const render = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/saved' }, createElement(SavedPage)));

beforeEach(() => {
  state.isLoading = false;
  state.isError = false;
  state.isSuccess = true;
  collections.data = { items: [] };
});

describe('Saved page', () => {
  it('invites the user to save something when nothing is saved yet', () => {
    const html = render();
    expect(html).toContain('Nothing saved yet');
    expect(html).toContain('Explore resources');
  });

  it('offers retry without claiming the list is empty after a failed request', () => {
    state.isError = true;
    state.isSuccess = false;
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Nothing saved yet');
  });

  it('lists collections with their size and visibility', () => {
    collections.data = {
      items: [{ id: 'c1', name: 'Onsite prep', itemCount: 2, isPrivate: true }],
    };
    const html = render();
    expect(html).toContain('Onsite prep');
    expect(html).toContain('2 posts');
    expect(html).toContain('private');
  });

  it('singularizes a one-post collection', () => {
    collections.data = { items: [{ id: 'c1', name: 'Read later', itemCount: 1, isPrivate: false }] };
    const html = render();
    expect(html).toContain('1 post');
    expect(html).not.toContain('1 posts');
  });

  it('keeps the saved feed out of the public eye', () => {
    expect(render()).toContain('Only you can see this.');
  });
});
