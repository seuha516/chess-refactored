import { defineConfig } from '@playwright/test';

const PORT = 4173;

// End-to-end tests against the production build. They use the locally
// installed Google Chrome (channel "chrome"), so no browser download is needed.
export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node src/server/index.ts',
    url: `http://localhost:${String(PORT)}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
