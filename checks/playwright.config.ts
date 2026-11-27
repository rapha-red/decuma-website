import { defineConfig } from '@playwright/test'

// SITE_URL: the built tree behind checks/Caddyfile; PROTO_URL: the prototype at PROTOTYPE_COMMIT (parity only).
export default defineConfig({
  testDir: '.',
  workers: 2,
  reporter: [['list']],
  snapshotPathTemplate: '.parity/{arg}{ext}',
  use: { baseURL: process.env.SITE_URL ?? 'http://127.0.0.1:8099', browserName: 'chromium' },
})
