import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Workers must be ES modules so the parser worker (which lazy-imports
  // `@coderline/alphatab` via dynamic `import()`) can be code-split by
  // Rollup. The default 'iife' format would force the entire worker chunk
  // — including alphatab — into a single bundle, and the build errors out.
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
} as any);
