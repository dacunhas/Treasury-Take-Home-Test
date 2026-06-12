import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Use React's automatic JSX runtime so the .tsx a11y test needs no explicit
  // React import (the component files are compiled by Next in the app build).
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    // Per-file environment override is used by the a11y test (jsdom); the rest
    // of the suite stays on the fast `node` environment.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
