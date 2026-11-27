// Browser checks of the built site (served by checks/Caddyfile): menu behaviour, consent and network, axe, and the
// pages reachable without JavaScript.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const CHOICE = encodeURIComponent(JSON.stringify({ v: 1, statistik: false, am: '2027-01-04' }))
const decided = async (page: Page, baseURL?: string) =>
  page.context().addCookies([{ name: 'decuma_consent', value: CHOICE, url: baseURL! }])

test.describe('menus at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  const panel = (p: Page) => p.locator('#menu-produkt')
  const trigger = (p: Page) => p.locator('button[aria-controls=menu-produkt]')

  test.beforeEach(async ({ page, baseURL }) => {
    await decided(page, baseURL)
    await page.goto('/')
  })

  test('pointer enter opens at once', async ({ page }) => {
    await trigger(page).hover()
    expect(await panel(page).isVisible()).toBe(true) // no auto-wait: open at once
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('leaving and re-entering within 150 ms keeps it open; leaving closes after 150 ms', async ({ page }) => {
    await trigger(page).hover()
    await page.mouse.move(640, 880) // below the panel, outside the wrapper
    await page.waitForTimeout(60)
    await trigger(page).hover()
    await page.waitForTimeout(250)
    expect(await panel(page).isVisible()).toBe(true)
    await page.mouse.move(640, 880)
    await page.waitForTimeout(80)
    expect(await panel(page).isVisible()).toBe(true)
    await page.waitForTimeout(200)
    expect(await panel(page).isHidden()).toBe(true) // no auto-wait: closed by 280 ms after leaving
  })

  test('Escape closes and returns focus to the trigger', async ({ page }) => {
    await trigger(page).hover()
    await page.locator('#menu-produkt a').first().focus()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(trigger(page)).toBeFocused()
  })

  test('keyboard activation toggles', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeHidden()
  })

  test('touch does not open on hover', async ({ page }) => {
    await trigger(page).dispatchEvent('pointerenter', { pointerType: 'touch' })
    await page.waitForTimeout(50)
    await expect(panel(page)).toBeHidden()
  })

  test('Preise, a press outside, the scrim and a menu link close it', async ({ page }) => {
    await trigger(page).hover()
    await page.locator('[data-preise]').hover()
    await expect(panel(page)).toBeHidden()
    await trigger(page).hover()
    await page.locator('[data-scrim]').click({ position: { x: 5, y: 800 } })
    await expect(panel(page)).toBeHidden()
    await trigger(page).hover()
    await page.locator('#menu-produkt a').first().click()
    await expect(page.locator('#menu-produkt')).toBeHidden()
  })
})

test.describe('consent', () => {
  test('first visit shows the bar; both choices look alike; a choice writes only decuma_consent; no other origin', async ({ page, baseURL }) => {
    const foreign: string[] = []
    page.on('request', (r) => new URL(r.url()).origin !== new URL(baseURL!).origin && foreign.push(r.url()))
    await page.goto('/')
    const bar = page.locator('[data-consent]')
    await expect(bar).toBeVisible()
    const [nein, ja] = [bar.locator('[data-choice="0"]'), bar.locator('[data-choice="1"]')]
    const look = (l: typeof nein) =>
      l.evaluate((e) => {
        const s = getComputedStyle(e)
        const r = e.getBoundingClientRect()
        return [r.width, r.height, s.backgroundColor, s.color, s.border, s.font, s.padding, e.className]
      })
    expect(await look(nein)).toEqual(await look(ja))
    await nein.click()
    await expect(bar).toBeHidden()
    const cookies = await page.context().cookies()
    expect(cookies.map((c) => c.name)).toEqual(['decuma_consent'])
    expect(cookies[0].expires * 1000 - Date.now()).toBeGreaterThan(180 * 24 * 3600 * 1000)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    await page.reload()
    await expect(bar).toBeHidden()
    expect(foreign).toEqual([])
  })

  test('the footer link reopens it with the details', async ({ page, baseURL }) => {
    await decided(page, baseURL)
    await page.goto('/')
    await page.locator('[data-consent-open]').click()
    const bar = page.locator('[data-consent]')
    await expect(bar).toBeVisible()
    await expect(bar.locator('input[type=checkbox]').first()).toBeChecked()
    await expect(bar.locator('input[type=checkbox]').first()).toBeDisabled()
    await expect(bar.locator('input[name=statistik]')).not.toBeChecked()
    await bar.locator('input[name=statistik]').check()
    await bar.locator('[data-save]').click()
    await expect(bar).toBeHidden()
    const c = (await page.context().cookies()).find((x) => x.name === 'decuma_consent')!
    expect(JSON.parse(decodeURIComponent(c.value)).statistik).toBe(true)
  })
})

test.describe('axe', () => {
  for (const path of ['/', '/en/', '/preise', '/en/pricing', '/datenversprechen']) {
    test(`no serious or critical finding on ${path}, banner and Produkt menu open`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(path)
      await page.locator('button[aria-controls=menu-produkt]').hover()
      const r = await new AxeBuilder({ page }).analyze()
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ': ' + v.nodes[0]?.target)).toEqual([])
    })
  }
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('footer and Preise reach every built page', async ({ page, request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    const all = [...sitemap.matchAll(/<loc>https:\/\/decuma\.de([^<]*)<\/loc>/g)].map((m) => m[1])
    expect(all.length).toBeGreaterThan(0)
    for (const home of ['/', '/en/']) {
      await page.goto(home)
      const reach = await page.locator('footer a[href^="/"], [data-preise]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
      const mine = all.filter((p) => (home === '/en/') === p.startsWith('/en/') && p !== home)
      expect(mine.filter((p) => !reach.includes(p))).toEqual([])
    }
  })
})

// The start page built from a test copy of data/offer.json (Hugo into a temporary directory), served through a route
// so that each case can change the offer without touching the tree under test.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const REPO = join(import.meta.dirname, '..')
function buildWith(change: (o: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'offer-'))
  for (const d of ['hugo.toml', 'content', 'layouts', 'i18n', 'data', 'assets', 'static']) cpSync(join(REPO, d), join(dir, d), { recursive: true })
  const o = JSON.parse(readFileSync(join(dir, 'data/offer.json'), 'utf8'))
  change(o)
  writeFileSync(join(dir, 'data/offer.json'), JSON.stringify(o))
  execFileSync(join(REPO, 'tools/bin/hugo'), ['--minify', '--logLevel', 'error', '-s', dir, '-d', join(dir, 'public')])
  return join(dir, 'public')
}
const SITE = 'http://site.test'
async function serve(page: Page, root: string) {
  await page.route(SITE + '/**', (r) => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname)
    const f = [p + '.html', join(p, 'index.html'), p].map((x) => join(root, x)).find((x) => existsSync(x) && statSync(x).isFile())
    return f ? r.fulfill({ path: f }) : r.fulfill({ status: 404 })
  })
}
const ALL_ON = (o: any) => Object.keys(o.flags).forEach((k) => (o.flags[k] = true))

test.describe('start page', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('motion: the hero plays its six steps once and stops; each visual plays once in view; nothing loops', async ({ page }) => {
    await serve(page, buildWith(ALL_ON))
    const t0 = Date.now()
    await page.goto(SITE + '/')
    await expect(page.locator('.chat-app[data-stufe="6"]')).toBeAttached({ timeout: 12000 })
    const took = Date.now() - t0
    expect(took).toBeGreaterThan(6500)
    expect(took).toBeLessThan(9500)
    const later = page.locator('.w-anim').last()
    expect(await later.getAttribute('data-an')).toBeNull() // not in view yet
    const changes = await page.evaluate(() => new Promise<number>((done) => {
      let n = 0
      new MutationObserver((m) => (n += m.length)).observe(document.querySelector('.chat-app')!, { subtree: true, childList: true, attributes: true })
      setTimeout(() => done(n), 2000)
    }))
    expect(changes).toBe(0) // the hero has stopped
    await later.scrollIntoViewIfNeeded()
    await expect(later).toHaveAttribute('data-an', '1')
    await page.waitForTimeout(4000)
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
    expect(await running()).toBe(0)
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length)).toBe(0)
    await page.mouse.wheel(0, -4000)
    await later.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    expect(await running()).toBe(0) // seen again: it does not play again
  })

  test('reduced motion: every end state at load', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await serve(page, buildWith(ALL_ON))
    await page.goto(SITE + '/')
    await expect(page.locator('.chat-app')).toHaveAttribute('data-stufe', '6')
    expect(await page.locator('.w-anim:not([data-an]), .w-z:not([data-an])').count()).toBe(0)
    await ctx.close()
  })

  test('plan cards follow data/offer.json: amounts, the toggle, a column whose flag is off', async ({ page }) => {
    await serve(page, buildWith((o) => {
      Object.assign(o.plans.find((p: any) => p.plan === 'pro'), { monthly: '12.00', intro: '1.20', yearly_per_month: '9.00', yearly: '108.00' })
      o.offer.columns.find((c: any) => c.key === 'free').flags = ['lohn']
      o.flags.lohn = false
    }))
    await page.goto(SITE + '/')
    const pro = page.locator('.w-tier:has(#k-pro)')
    const text = async () => (await pro.locator('.preis:visible, .notiz:visible').allInnerTexts()).join(' | ').replace(/ /g, ' ')
    expect(await text()).toBe('9 €statt 12 € | im Monat (zzgl. USt.), 108 € im Jahr, jährlich abgerechnet')
    await page.locator('[data-billing="monthly"]').click()
    expect(await text()).toBe('1,20 €statt 12 € | im Monat (zzgl. USt.) für die ersten 3 Monate, danach 12 €. Monatlich kündbar.')
    await expect(page.locator('[data-billing="monthly"]')).toHaveAttribute('aria-pressed', 'true')
    await page.locator('[data-billing="yearly"]').click()
    expect(await text()).toContain('108 € im Jahr')
    await expect(page.locator('#k-free')).toHaveCount(0)
  })
})
