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
  for (const path of ['/', '/en/', '/preise', '/preise/service', '/en/pricing', '/datenversprechen', '/neu-in-decuma', '/impressum', '/datenschutz', '/agb', '/avv', '/unterauftragnehmer', '/en/imprint']) {
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
function buildWith(change: (o: any) => void, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'offer-'))
  for (const d of ['hugo.toml', 'content', 'layouts', 'i18n', 'data', 'assets', 'static']) cpSync(join(REPO, d), join(dir, d), { recursive: true })
  const o = JSON.parse(readFileSync(join(dir, 'data/offer.json'), 'utf8'))
  change(o)
  writeFileSync(join(dir, 'data/offer.json'), JSON.stringify(o))
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text)
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
    // the page's own clock: when each step was reached, from the moment the chat started (hero.js marks data-an)
    await page.addInitScript(() => {
      const w = window as any
      w.steps = {}
      new MutationObserver((m) => m.forEach((x) => {
        const e = x.target as Element
        if (e.classList?.contains('chat-app')) w.steps[x.attributeName === 'data-an' ? 'start' : e.getAttribute('data-stufe')!] = performance.now()
      })).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-stufe', 'data-an'] })
    })
    await page.goto(SITE + '/')
    await expect(page.locator('.chat-app[data-stufe="6"]')).toBeAttached({ timeout: 12000 })
    const s = await page.evaluate(() => (window as any).steps)
    const took = s['6'] - s.start
    expect(took).toBeGreaterThan(7400) // 900 + 1500 + 1400 + 1300 + 1300 + 1100 ms
    expect(took).toBeLessThan(8500)
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
    // every animation is finite: all of them finish (an infinite one would never resolve)
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
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
    const text = async () => (await pro.locator('.preis:visible, .notiz:visible').allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
    expect(await text()).toBe('9 € statt 12 € | im Monat (zzgl. USt.), 108 € im Jahr, jährlich abgerechnet')
    await page.locator('[data-billing="monthly"]').click()
    expect(await text()).toBe('1,20 € statt 12 € | im Monat (zzgl. USt.) für die ersten 3 Monate, danach 12 €. Monatlich kündbar.')
    await expect(page.locator('[data-billing="monthly"]')).toHaveAttribute('aria-pressed', 'true')
    await page.locator('[data-billing="yearly"]').click()
    expect(await text()).toContain('108 € im Jahr')
    await expect(page.locator('#k-free')).toHaveCount(0)
  })
})

// The price page: the comparison from data/offer.json, its column picker on phones, the unknown-cell stop.
// A Max column and Max-only rows exist in no price list yet, so the test copy adds them (synthetic test data).
const visible = (o: any) => {
  const on = (r: any) => r.flags.every((f: string) => o.flags[f]) && (!r.any_flags.length || r.any_flags.some((f: string) => o.flags[f]))
  return o.offer.groups.flatMap((g: any) => g.rows.filter(on).map((r: any) => r.key))
}
const withMax = (o: any) => {
  o.plans.push({ ...o.plans.find((p: any) => p.plan === 'pro'), plan: 'agent', name: 'Max', monthly: '20.00', intro: '2.00', yearly_per_month: '15.00', yearly: '180.00' })
  o.offer.columns.splice(2, 0, { ...o.offer.columns.find((c: any) => c.key === 'pro'), key: 'agent', highlight: false, flags: ['agent_tier'], de: 'Max', en: 'Max', href: '#/checkout/max' })
  o.offer.groups.forEach((g: any) => g.rows.forEach((r: any) => r.cells.push(r.cells[1])))
  o.offer.groups[1].rows.splice(1, 0, { key: 'supplier_invoices', de: 'Rechnungen aus Lieferanten-Konten abholen', en: 'x', capability: 'x', flags: ['agent_tier'], any_flags: [], cells: ['no', 'no', 'yes'] })
  o.offer.groups[1].rows.push({ key: 'payroll', de: 'Lohnabrechnung', en: 'x', capability: 'x', flags: ['lohn'], any_flags: [], cells: ['no', 'yes', 'yes'] })
  o.offer.groups[3].rows.push({ key: 'founding_transmission', de: 'Übermittlung', en: 'x', capability: 'x', flags: [], any_flags: ['eric', 'auftrag'], cells: ['no', 'yes', 'yes'] })
}

test.describe('price page', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  const rows = (page: Page) => page.locator('tr[data-row]').evaluateAll((t) => t.map((r) => r.getAttribute('data-row')))
  const heads = (page: Page) => page.locator('[data-columns] thead th:not(:first-child)').allInnerTexts()

  test('every row and column comes from data/offer.json, flagged ones only while on', async ({ page }) => {
    const offer = JSON.parse(readFileSync(join(REPO, 'data/offer.json'), 'utf8'))
    await page.goto('/preise')
    expect(await rows(page)).toEqual(visible(offer))
    for (const [state, max] of [[false, false], [true, true]] as const) {
      let copy: any
      await serve(page, buildWith((o) => { withMax(o); o.flags.agent_tier = state; o.flags.eric = state; copy = o }))
      await page.goto(SITE + '/preise')
      expect(await heads(page)).toEqual(max ? ['Kostenlos', 'Pro', 'Max'] : ['Kostenlos', 'Pro'])
      const got = await rows(page)
      expect(got).toEqual(visible(copy))
      expect(got.includes('supplier_invoices')).toBe(max)
      expect(got.includes('payroll')).toBe(false) // lohn off
      expect(got.includes('founding_transmission')).toBe(state) // any of eric, auftrag
      expect(await page.locator('#agent').count()).toBe(max ? 1 : 0)
      await page.unroute(SITE + '/**')
    }
  })

  test('an unknown cell value stops the build, naming group, row and column', async () => {
    const cell = (v: string) => () => buildWith((o) => (o.offer.groups[0].rows[2].cells[1] = v))
    expect(cell('maybe')).toThrow(/offer group "invoices" row "recurring_invoices" column "pro": unknown cell value maybe/)
    expect(cell('yes')).not.toThrow()
  })

  test('the booking link is the only outbound link of Done-for-you and opens cal.com directly', async ({ page }) => {
    await page.goto('/preise/service')
    const out = await page.locator('a[href^="http"]').evaluateAll((as) =>
      as.map((a) => [a.getAttribute('href'), a.getAttribute('target')]).filter(([h]) => !/^https:\/\/(app\.)?decuma\.de\//.test(h!)))
    expect(new Set(out.map(([h]) => h))).toEqual(new Set(['https://cal.com/decuma-raphael/30min']))
    expect(out.every(([, t]) => t === '_blank')).toBe(true)
  })
})

test.describe('price page on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  for (const path of ['/preise', '/preise/service']) {
    test(`${path}: the control picks the one column shown, by keyboard too; no sideways scroll; axe clean`, async ({ page }) => {
      await page.goto(path)
      const pick = page.locator('[data-pick]')
      const box = page.locator('[data-columns]')
      const shown = () => box.locator('thead th:not(:first-child)').evaluateAll((t) => t.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent))
      const buttons = pick.locator('button')
      const names = await buttons.allInnerTexts()
      expect(await shown()).toEqual([await pick.locator('[aria-pressed=true]').innerText()])
      for (const [i, name] of names.entries()) {
        await buttons.nth(i).focus()
        await page.keyboard.press(i % 2 ? 'Enter' : 'Space')
        await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true')
        expect(await shown()).toEqual([name])
      }
      expect(await box.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const r = await new AxeBuilder({ page }).analyze()
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ': ' + v.nodes[0]?.target)).toEqual([])
    })
  }
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })
    test('every column shows, in a scroll box', async ({ page }) => {
      await page.goto('/preise')
      await expect(page.locator('[data-pick]')).toBeHidden()
      expect(await page.locator('[data-columns] thead th:visible').count()).toBe(3)
      expect(await page.locator('[data-columns]').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    })
  })
})

test.describe('open source, Neu in Decuma, legal pages', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('/open-source with source_link on: built, the GitHub button leads to the repository, html-validate and axe clean', async ({ page }) => {
    const root = buildWith(ALL_ON)
    execFileSync(join(REPO, 'checks/node_modules/.bin/html-validate'), ['--config', join(REPO, 'checks/.htmlvalidate.json'), join(root, 'open-source.html'), join(root, 'en/open-source.html'), join(root, 'datenversprechen.html')], { stdio: 'pipe' })
    await serve(page, root)
    await page.goto(SITE + '/open-source')
    await expect(page.locator('.w-hero a.btn')).toHaveAttribute('href', 'https://github.com/rapha-red/open-decuma')
    const r = await new AxeBuilder({ page }).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ': ' + v.nodes[0]?.target)).toEqual([])
  })

  test('a new changelog entry shows first with its date after a rebuild', async ({ page }) => {
    const yaml = (extra: string) => `- {date: 2026-11-20, de: "Ältere Zeile.", en: "Older line."}\n${extra}`
    await serve(page, buildWith(() => {}, { 'data/changelog.yaml': yaml('- {date: 2026-12-04, de: "Neue Zeile.", en: "New line."}\n') }))
    await page.goto(SITE + '/neu-in-decuma')
    await expect(page.locator('.w-neu li').first()).toHaveText('4. Dezember 2026Neue Zeile.')
    await expect(page.locator('.w-neu li time').first()).toHaveAttribute('datetime', '2026-12-04')
    await page.goto(SITE + '/en/whats-new')
    await expect(page.locator('.w-neu li').first()).toHaveText('4 December 2026New line.')
  })

  for (const path of ['/impressum', '/datenschutz']) {
    test(`${path} at 390 px: the open consent bar never hides the text for good`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await expect(page.locator('[data-consent]')).toBeVisible()
      for (const el of await page.locator('main .recht > *').all()) {
        await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
        const box = (await el.boundingBox())!
        const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('main'), [box.x + 4, box.y + Math.min(box.height / 2, 400)])
        expect(hit, 'covered by the consent bar').toBe(true)
      }
    })
  }
})
