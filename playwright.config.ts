import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fixtures.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'bun run build && bun run preview', url: 'http://localhost:4173' },
})
