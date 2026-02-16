import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@aegis/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      '@aegis/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@aegis/skills': path.resolve(__dirname, 'packages/skills/src/index.ts'),
      '@aegis/runtime': path.resolve(__dirname, 'packages/runtime/src/index.ts'),
      '@aegis/persistence': path.resolve(__dirname, 'packages/persistence/src/index.ts'),
    },
  },
});
