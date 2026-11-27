// Visual parity of the shell with the prototype: the prototype shot is the baseline, the site shot is compared with
// maxDiffPixelRatio 0.02. Both with reduced motion, a stored consent choice, the prototype bar hidden, the footer year
// masked. Run by checks/parity.sh, which passes FLAGS (the flags that are on), STARS and
// LABEL (the flag state: "offer" or "all").
import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const PROTO = `http://127.0.0.1:${process.env.PROTO_PORT ?? '5180'}/`
const FLAGS = process.env.FLAGS || 'aus'
const STARS = process.env.STARS ?? '0'
const LABEL = process.env.LABEL ?? 'offer'
// owner-approved differences: CSS hiding the part (on both sides, see exceptions()), per case ("*" for all), from parity-exceptions.txt
const EXCEPTIONS = readFileSync(new URL('./parity-exceptions.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.split('\t'))

// the prototype bar is hidden and its page scroller opened up so a full-page shot covers the whole page, as on the
// site; the shell is compared on an empty main on both sides
// (the prototype lifts the consent bar above its own bar, which is hidden here)
const PROTO_CSS = 'aside.proto { display: none !important } .viewport, .bare { height: auto !important; overflow: visible !important } .web .w-cookies { bottom: 0 !important }'
const EMPTY_MAIN = ' main > * { display: none !important }'
// page: prototype route and site address per language; the shell pages compare only header and footer
const PAGES = {
  shell: { route: '#/web/leer', de: '/datenversprechen', en: '/en/data-promise', css: EMPTY_MAIN },
  start: { route: '#/web', de: '/', en: '/en/', css: '' },
  preise: { route: '#/web/preise', de: '/preise', en: '/en/pricing', css: '' },
  service: { route: '#/web/preise/service', de: '/preise/service', en: '/en/pricing/service', css: '' },
  os: { route: '#/web/open-source', de: '/open-source', en: '/en/open-source', css: '' },
  dv: { route: '#/web/datenversprechen', de: '/datenversprechen', en: '/en/data-promise', css: '' },
  neu: { route: '#/web/neu', de: '/neu-in-decuma', en: '/en/whats-new', css: '' },
  impressum: { route: '#/web/impressum', de: '/impressum', en: '/en/imprint', css: '' },
  datenschutz: { route: '#/web/datenschutz', de: '/datenschutz', en: '/en/privacy', css: '' },
  agb: { route: '#/web/agb', de: '/agb', en: '/en/terms', css: '' },
  avv: { route: '#/web/avv', de: '/avv', en: '/en/dpa', css: '' },
  unterauftragnehmer: { route: '#/web/unterauftragnehmer', de: '/unterauftragnehmer', en: '/en/subprocessors', css: '' },
}
// owner-approved differences of a case in this flag state, as CSS hiding the part on both sides (a part the site lacks
// matches nothing there)
const exceptions = (c: Case) => EXCEPTIONS.filter(([n, , label]) => (n === '*' || n === c.name) && (!label || label === LABEL)).map(([, css]) => css).join(' ')

async function proto(page: Page, lang: string, c: Case) {
  if (!c.bar) await page.addInitScript(() => localStorage.setItem('decuma-consent', JSON.stringify({ statistik: false, am: '2027-01-04' })))
  const pg = PAGES[c.page ?? 'shell']
  await page.goto(`${PROTO}?lang=${lang}&flags=${FLAGS}&sterne=${STARS}${pg.route}`)
  await page.addStyleTag({ content: PROTO_CSS + pg.css + ' ' + exceptions(c) })
  await page.locator('.w-head').waitFor()
}

async function site(page: Page, lang: string, c: Case) {
  if (!c.bar) await page.context().addCookies([{ name: 'decuma_consent', value: encodeURIComponent(JSON.stringify({ v: 1, statistik: false, am: '2027-01-04' })), url: `http://127.0.0.1:${process.env.SITE_PORT ?? '8099'}` }])
  await page.goto(PAGES[c.page ?? 'shell'][lang as 'de' | 'en'])
  await page.addStyleTag({ content: PAGES[c.page ?? 'shell'].css + ' ' + exceptions(c) })
  await page.locator('.w-head').waitFor()
}

// states: the flag states the case runs in (both when absent); bar: no stored choice, so the consent bar shows (the viewport shot holds it)
type Case = { name: string; page?: keyof typeof PAGES; width: number; height: number; full: boolean; states?: string[]; bar?: boolean; act?: (p: Page) => Promise<void> }
const open = (m: string) => async (p: Page) => {
  await p.locator(`button[aria-controls=menu-${m}]`).hover()
  await p.locator(`#menu-${m}`).waitFor()
}
const pick = (name: string, i: number) => async (p: Page) => {
  const b = p.locator('.w-nur-handy button').nth(i)
  if (!(await b.count())) {
    if (p.url().startsWith(PROTO)) test.skip(true, `no column ${i} on the prototype in this flag state`)
    // a column the site lacks is a difference only when parity-exceptions.txt lists it for this case
    test.skip(exceptions({ name } as Case) !== '', `column ${i}: listed in parity-exceptions.txt`)
    throw new Error(`the site has no column ${i} of the segmented control`)
  }
  await b.click()
}
const settings = async (p: Page) => {
  await p.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await p.getByRole('button', { name: 'Auswahl speichern' }).waitFor()
}
const CASES: Case[] = [
  ...[1280, 390].flatMap((width) => [
    { name: `cookies-${width}`, width, height: width === 390 ? 844 : 900, full: false, bar: true },
    { name: `cookies-details-${width}`, width, height: width === 390 ? 844 : 900, full: false, bar: true, act: settings },
  ]),
  { name: 'shell-1280', width: 1280, height: 900, full: true },
  { name: 'shell-390', width: 390, height: 844, full: true },
  { name: 'start-1280', page: 'start', width: 1280, height: 900, full: true },
  { name: 'start-390', page: 'start', width: 390, height: 844, full: true },
  { name: 'produkt-1280', width: 1280, height: 900, full: false, act: open('produkt') },
  { name: 'gruendung-1280', width: 1280, height: 900, full: false, act: open('gruendung') },
  { name: 'ressourcen-1280', width: 1280, height: 900, full: false, act: open('ressourcen') },
  { name: 'preise-1280', page: 'preise', width: 1280, height: 900, full: true },
  { name: 'service-1280', page: 'service', width: 1280, height: 900, full: true },
  // at 390 px once per column of the segmented control above the comparison (a column the prototype lacks is skipped)
  ...[0, 1, 2].map((i) => ({ name: `preise-390-c${i}`, page: 'preise' as const, width: 390, height: 844, full: true, act: pick(`preise-390-c${i}`, i) })),
  ...[0, 1, 2, 3].map((i) => ({ name: `service-390-c${i}`, page: 'service' as const, width: 390, height: 844, full: true, act: pick(`service-390-c${i}`, i) })),
  // the open-source page exists only with source_link (off in data/offer.json); the legal frames and Neu in Decuma do
  // not change with a flag
  ...(['os', 'dv', 'neu', 'impressum', 'datenschutz', 'agb', 'avv', 'unterauftragnehmer'] as const).flatMap((pg) =>
    [1280, 390].map((w) => ({ name: `${pg}-${w}`, page: pg, width: w, height: w === 1280 ? 900 : 844, full: true, states: pg === 'os' ? ['all'] : pg === 'dv' ? undefined : ['offer'] })),
  ),
  {
    name: 'sheet-390',
    width: 390,
    height: 844,
    full: false,
    act: async (p) => {
      await p.locator('.w-burger').click()
      await p.locator('#w-sheet').waitFor()
      await p.locator('#w-sheet > button').first().click()
    },
  },
]

for (const lang of ['de']) {
  for (const c of CASES.filter((c) => !c.states || c.states.includes(LABEL))) {
    test(`${LABEL} ${lang} ${c.name}`, async ({ browser }, info) => {
      const opts = { viewport: { width: c.width, height: c.height }, reducedMotion: 'reduce' as const, deviceScaleFactor: 1 }
      const shot = { fullPage: c.full, mask: [] as ReturnType<Page['locator']>[], animations: 'disabled' as const }
      const a = await browser.newContext(opts)
      const pa = await a.newPage()
      await proto(pa, lang, c)
      await c.act?.(pa)
      const base = await pa.screenshot({ ...shot, mask: [pa.locator('.w-foot-bar > span:first-child')] })
      await a.close()
      const name = `${LABEL}-${lang}-${c.name}.png`
      const path = info.snapshotPath(name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, base)
      const b = await browser.newContext({ ...opts, baseURL: `http://127.0.0.1:${process.env.SITE_PORT ?? '8099'}` })
      const pb = await b.newPage()
      await site(pb, lang, c)
      await c.act?.(pb)
      await expect(pb).toHaveScreenshot(name, { ...shot, mask: [pb.locator('.w-foot-bar > span:first-child')], maxDiffPixelRatio: Number(process.env.PARITY_RATIO ?? 0.02) })
      await b.close()
    })
  }
}
