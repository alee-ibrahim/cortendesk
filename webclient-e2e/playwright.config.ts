import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:4173/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
