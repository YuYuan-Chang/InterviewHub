import type { QueryClient } from '@tanstack/react-query';

export async function refreshSavedQueries(client: QueryClient) {
  await Promise.all(
    ['saved', 'saved-resource', 'collections', 'feed', 'search-posts', 'profile-posts', 'post']
      .map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
