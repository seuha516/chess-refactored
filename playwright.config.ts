import { defineConfig } from '@playwright/test';

const PORT = 4173;
// E2E_BASE_URL runs the tests against an existing deployment instead of a local build.
const deployed = process.env.E2E_BASE_URL;

// End-to-end tests against the production build. They use the locally
// installed Google Chrome (channel "chrome"), so no browser download is needed.
export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: deployed ?? `http://localhost:${String(PORT)}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  ...(deployed
    ? {}
    : {
        webServer: {
          command: 'npm run build && node src/server/index.ts',
          url: `http://localhost:${String(PORT)}`,
          // Every test browser connects from 127.0.0.1, so lift the per-address limit.
          env: { PORT: String(PORT), CONNECTIONS_PER_MINUTE: '1000' },
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }),
});
