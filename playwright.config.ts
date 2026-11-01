import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fixtures.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:4173' },
  // Set BASE_URL to test a live deployment instead of a local build.
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'bun run build && bun run preview', url: 'http://localhost:4173' },
})
