import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { TagCount } from '../types';

/**
 * Multi-tag filter chips (fed by the popular-tags endpoint) + sort control.
 * State lives in the URL (?tags=a,b&sort=popular) so filters survive navigation.
 */
export function FilterBar() {
  const [params, setParams] = useSearchParams();
  const selected = (params.get('tags') ?? '').split(',').filter(Boolean);
  const sort = params.get('sort') === 'popular' ? 'popular' : 'recent';

  const { data } = useQuery({
    queryKey: ['popular-tags'],
    queryFn: () => api<{ tags: TagCount[] }>('/api/posts/tags/popular'),
    staleTime: 60_000,
  });

  function toggleTag(tag: string) {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
    if (next.length) params.set('tags', next.join(','));
    else params.delete('tags');
    setParams(params, { replace: true });
  }

  const chips = [...new Set([...selected, ...(data?.tags.map((t) => t.tag) ?? [])])].slice(0, 14);

  return (
    <div className="filter-bar">
      <div className="filter-chips">
        {chips.map((tag) => (
          <button
            key={tag}
            className={`tag ${selected.includes(tag) ? 'tag-active' : ''}`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
            {selected.includes(tag) && ' ✕'}
          </button>
        ))}
        {chips.length === 0 && <span className="page-note">No tags yet</span>}
      </div>
      <select
        value={sort}
        onChange={(e) => {
          params.set('sort', e.target.value);
          setParams(params, { replace: true });
        }}
        aria-label="Sort"
      >
        <option value="recent">Newest</option>
        <option value="popular">Top</option>
      </select>
    </div>
  );
}
