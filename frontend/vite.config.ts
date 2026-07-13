import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy mirrors the ingress/nginx path routing so the SPA always talks same-origin.
const routes: Record<string, number> = {
  '/api/auth': 4001,
  '/api/users': 4002,
  '/api/posts': 4003,
  '/api/files': 4004,
  '/api/comments': 4005,
  '/api/notifications': 4006,
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(routes).map(([path, port]) => [path, { target: `http://localhost:${port}` }]),
    ),
  },
});
