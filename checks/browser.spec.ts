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

test.describe('axe', () => {
  for (const path of ['/', '/en/', '/preise', '/preise/service', '/en/pricing', '/datenversprechen']) {
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

// Consent (D-313 in the specs): nothing non-essential before a choice, on every built page; the gate for registered
// scripts; the bar by keyboard. FIRST_PARTY is the set of check_site.py.
const FIRST_PARTY = /^\/js\/(?:anim|hero|menu|consent|search|plans|columns)(?:\.min)?(?:\.[0-9a-f]{64})?\.js$|^\/pagefind\//
const TREE = process.env.SITE_ROOT ?? join(REPO, 'public')
const ALL_PAGES = [...readFileSync(join(TREE, 'sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/decuma\.de([^<]*)<\/loc>/g)].map((m) => m[1]).concat('/404', '/en/404')
const stored = (page: Page) =>
  page.evaluate(async () => [...Object.keys(localStorage), ...Object.keys(sessionStorage), ...(await indexedDB.databases()).map((d) => 'idb:' + d.name)])
const scripts = (page: Page) => page.locator('script[src]').evaluateAll((s) => s.map((e) => { const u = new URL((e as HTMLScriptElement).src); return u.origin === location.origin ? u.pathname : u.href }))

test.describe('consent on every page', () => {
  for (const path of ALL_PAGES) {
    test(`${path}: no stored choice and after "Ablehnen": own files only, nothing stored before a click, only decuma_consent after, first-party scripts only`, async ({ browser, baseURL }, info) => {
      const ctx = await browser.newContext({ baseURL })
      const page = await ctx.newPage()
      const requests: string[] = []
      page.on('request', (r) => requests.push(r.url()))
      await page.goto(path, { waitUntil: 'networkidle' })
      const before = { cookies: (await ctx.cookies()).map((c) => c.name), storage: await stored(page), scripts: await scripts(page) }
      await page.locator('[data-choice="0"]').click()
      const at = requests.length
      await page.reload({ waitUntil: 'networkidle' })
      const after = { cookies: (await ctx.cookies()).map((c) => c.name), storage: await stored(page), scripts: await scripts(page) }
      await expect(page.locator('[data-consent]')).toBeHidden()
      // network log and storage dump of this page, kept as evidence in the test's output directory
      writeFileSync(info.outputPath('consent-log.json'), JSON.stringify({ path, before, after, requests: requests.map((u) => u.replace(baseURL!, '')), afterReject: requests.slice(at).map((u) => u.replace(baseURL!, '')) }))
      await ctx.close()
      expect.soft(requests.filter((u) => new URL(u).origin !== new URL(baseURL!).origin), 'requests to another origin').toEqual([])
      expect.soft(before.cookies, 'cookies before a click').toEqual([])
      expect.soft(before.storage, 'storage before a click').toEqual([])
      expect.soft(after.cookies, 'cookies after "Ablehnen"').toEqual(['decuma_consent'])
      expect.soft(after.storage, 'storage after "Ablehnen"').toEqual([])
      expect.soft([...before.scripts, ...after.scripts].filter((s) => !FIRST_PARTY.test(s)), 'scripts outside the first-party set').toEqual([])
    })
  }
})

test.describe('consent', () => {
  for (const width of [1280, 390]) {
    test(`at ${width} px "Ablehnen" and "Akzeptieren" look alike and take one click; the choice lasts 6 months`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      const bar = page.locator('[data-consent]')
      const [nein, ja] = [bar.locator('[data-choice="0"]'), bar.locator('[data-choice="1"]')]
      const look = (l: typeof nein) =>
        l.evaluate((e) => {
          const s = getComputedStyle(e)
          const r = e.getBoundingClientRect()
          return [r.width, r.height, s.backgroundColor, s.color, s.border, s.font, s.padding, e.className]
        })
      expect(await look(nein)).toEqual(await look(ja))
      await (width === 1280 ? ja : nein).click()
      await expect(bar).toBeHidden()
      const c = (await page.context().cookies()).find((x) => x.name === 'decuma_consent')!
      expect(JSON.parse(decodeURIComponent(c.value)).statistik).toBe(width === 1280)
      expect(c.expires * 1000 - Date.now()).toBeGreaterThan(180 * 24 * 3600 * 1000)
    })
  }

  test('keyboard only: controls in order, Escape is no choice, region and labels named; axe clean with the details open', async ({ page }) => {
    await page.goto('/')
    const bar = page.getByRole('region', { name: 'Cookies' })
    await expect(bar).toBeVisible()
    await bar.getByRole('link').focus()
    for (const name of ['Ablehnen', 'Akzeptieren', 'Einstellungen']) {
      await page.keyboard.press('Tab')
      await expect(bar.getByRole('button', { name })).toBeFocused()
    }
    await page.keyboard.press('Escape')
    await expect(bar).toBeVisible()
    expect(await page.context().cookies()).toEqual([])
    await page.keyboard.press('Enter')
    await expect(bar.getByRole('group', { name: 'Kategorien' })).toBeVisible()
    await expect(bar.getByRole('checkbox', { name: /^Statistik/ })).toBeFocused()
    await expect(bar.getByRole('checkbox', { name: /^Notwendig/ })).toBeDisabled()
    const r = await new AxeBuilder({ page }).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ': ' + v.nodes[0]?.target)).toEqual([])
    await page.keyboard.press('Space')
    await page.keyboard.press('Tab')
    await expect(bar.getByRole('button', { name: 'Auswahl speichern' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(bar).toBeHidden()
    const c = (await page.context().cookies()).find((x) => x.name === 'decuma_consent')!
    expect(JSON.parse(decodeURIComponent(c.value)).statistik).toBe(true)
  })

  // a dummy script registered under statistik (synthetic, test copy of the site)
  const STATS = { 'static/stats.js': 'window.dummyStats = (window.dummyStats || 0) + 1\n' }
  const registry = (version: number) => readFileSync(join(REPO, 'data/consent.yaml'), 'utf8')
    .replace(/^version: \d+$/m, `version: ${version}`)
    .replace(/^scripts: \[\]$/m, 'scripts:\n  - src: /stats.js\n    category: statistik\n    purpose: {de: Test, en: test}\n    storage: {de: nichts, en: nothing}')

  test('a registered statistik script loads only after accepting; revoked from the footer it is gone, on the next page too', async ({ page }) => {
    await serve(page, buildWith(() => {}, { ...STATS, 'data/consent.yaml': registry(1) }))
    const loads: string[] = []
    page.on('request', (r) => r.url().endsWith('/stats.js') && loads.push(new URL(r.url()).pathname))
    const ran = () => page.evaluate(() => (window as any).dummyStats ?? 0)
    await page.goto(SITE + '/')
    await page.waitForLoadState('networkidle')
    expect([loads.length, await ran()]).toEqual([0, 0])
    await page.locator('[data-choice="1"]').click()
    await expect.poll(ran).toBe(1)
    await page.goto(SITE + '/preise')
    await expect.poll(ran).toBe(1)
    expect(loads.length).toBe(2)
    await page.locator('[data-consent-open]').click()
    await expect(page.locator('input[name=statistik]')).toBeChecked()
    await page.locator('input[name=statistik]').uncheck()
    await Promise.all([page.waitForEvent('load'), page.locator('[data-save]').click()]) // revoking reloads
    await page.goto(SITE + '/buchhaltung')
    await page.waitForLoadState('networkidle')
    expect([loads.length, await ran(), await page.locator('script[src$="/stats.js"]').count()]).toEqual([2, 0, 0])
  })

  test('a changed registry version asks again and loads nothing until then', async ({ page }) => {
    await serve(page, buildWith(() => {}, { ...STATS, 'data/consent.yaml': registry(2) }))
    await page.context().addCookies([{ name: 'decuma_consent', value: encodeURIComponent(JSON.stringify({ v: 1, statistik: true, am: '2027-01-04' })), url: SITE }])
    await page.goto(SITE + '/')
    await expect(page.locator('[data-consent]')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => (window as any).dummyStats ?? 0)).toBe(0)
  })

  test('the cookie table of the Datenschutzerklärung lists the registry', async ({ page }) => {
    await serve(page, buildWith(() => {}, {
      'content/datenschutz.md': '---\ntranslationKey: datenschutz\n---\n{{< cookie-table >}}\n',
      'layouts/_default/single.html': '{{ define "main" }}{{ .Content }}{{ end }}', // the legal frame may not render content yet
    }))
    await page.goto(SITE + '/datenschutz')
    expect(await page.locator('.w-cookie-table tr').evaluateAll((r) => r.map((x) => (x as HTMLElement).innerText.split('\t')))).toEqual([
      ['Name', 'Zweck', 'Dauer', 'Kategorie'],
      ['decuma_consent', 'speichert deine Auswahl in diesem Banner', '6 Monate', 'Notwendig'],
    ])
  })
})
