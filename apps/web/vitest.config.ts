import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default node; los tests de render declaran `// @vitest-environment jsdom`
    // por archivo (capa de tests de UI/a11y de SDD 010).
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'src/**/__tests__/**/*.test.ts',
      'scripts/verify_servidumbre_precision_teno.ts',
    ],
    setupFiles: ['./tests/render/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/render/server-only.ts'),
    },
  },
})
