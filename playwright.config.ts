import { defineConfig, devices } from '@playwright/test'

const localBaseUrl = 'http://127.0.0.1:4173'
const isRemoteSuite = Boolean(process.env.PILOT_BASE_URL?.trim())
if (isRemoteSuite) process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const baseURL = isRemoteSuite ? process.env.PILOT_BASE_URL : localBaseUrl
const useInstalledEdge = process.platform === 'win32' && !process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: isRemoteSuite ? 'off' : 'on-first-retry',
    screenshot: isRemoteSuite ? 'off' : 'only-on-failure',
    video: isRemoteSuite ? 'off' : process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: useInstalledEdge ? 'edge' : 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useInstalledEdge ? { channel: 'msedge' } : {}),
      },
    },
  ],
  webServer: isRemoteSuite
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
