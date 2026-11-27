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
