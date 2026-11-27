import { defineConfig } from '@playwright/test'

// SITE_ROOT: the built tree, served by checks/Caddyfile on SITE_PORT; PROTO_URL: the prototype at PROTOTYPE_COMMIT
// (parity only, see parity.sh).
const port = process.env.SITE_PORT ?? '8099'
export default defineConfig({
  testDir: '.',
  workers: 2,
  reporter: [['list']],
  snapshotPathTemplate: '.parity/{arg}{ext}',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  webServer: {
    command: '../tools/bin/caddy run --config Caddyfile --adapter caddyfile',
    url: `http://127.0.0.1:${port}/robots.txt`,
    env: { SITE_ROOT: process.env.SITE_ROOT ?? '../public', SITE_PORT: port },
    reuseExistingServer: false,
    stderr: 'ignore',
  },
})
