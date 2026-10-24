import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API has no CORS, so the dev server forwards /api/* to it on port 3000.
const api = {
  '/api': { target: 'http://127.0.0.1:3000', rewrite: (path: string) => path.replace(/^\/api/, '') },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: api },
  preview: { port: 5173, proxy: api },
});
