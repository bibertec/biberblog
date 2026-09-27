import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Uses the `paths` of tsconfig.json (e.g. `@/…`).
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
