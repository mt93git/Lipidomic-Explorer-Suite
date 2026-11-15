import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Excel ZIP initialization can exceed the default 5s on shared CI hosts.
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
