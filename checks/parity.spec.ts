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
// owner-approved differences: CSS hiding the part on the prototype side, per case ("*" for all), from parity-exceptions.txt
const EXCEPTIONS = readFileSync(new URL('./parity-exceptions.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.split('\t'))

// the prototype shows a later-phase note in main; the shell is compared on an empty main
// and its page scroller is opened up so a full-page shot covers the whole page, as on the site
const PROTO_CSS = 'aside.proto { display: none !important } main > * { display: none !important } .viewport, .bare { height: auto !important; overflow: visible !important }'

async function proto(page: Page, lang: string, name: string) {
  await page.addInitScript(() => localStorage.setItem('decuma-consent', JSON.stringify({ statistik: false, am: '2027-01-04' })))
  await page.goto(`${PROTO}?lang=${lang}&flags=${FLAGS}&sterne=${STARS}#/web/leer`)
  const extra = EXCEPTIONS.filter(([c]) => c === '*' || c === name).map(([, css]) => css).join(' ')
  await page.addStyleTag({ content: PROTO_CSS + ' ' + extra })
  await page.locator('.w-head').waitFor()
}

async function site(page: Page, lang: string) {
  await page.context().addCookies([{ name: 'decuma_consent', value: encodeURIComponent(JSON.stringify({ v: 1, statistik: false, am: '2027-01-04' })), url: `http://127.0.0.1:${process.env.SITE_PORT ?? '8099'}` }])
  await page.goto(lang === 'de' ? '/datenversprechen' : '/en/data-promise')
  await page.locator('.w-head').waitFor()
}

type Case = { name: string; width: number; height: number; full: boolean; act?: (p: Page) => Promise<void> }
const open = (m: string) => async (p: Page) => {
  await p.locator(`button[aria-controls=menu-${m}]`).hover()
  await p.locator(`#menu-${m}`).waitFor()
}
const CASES: Case[] = [
  { name: 'shell-1280', width: 1280, height: 900, full: true },
  { name: 'shell-390', width: 390, height: 844, full: true },
  { name: 'produkt-1280', width: 1280, height: 900, full: false, act: open('produkt') },
  { name: 'gruendung-1280', width: 1280, height: 900, full: false, act: open('gruendung') },
  { name: 'ressourcen-1280', width: 1280, height: 900, full: false, act: open('ressourcen') },
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
  for (const c of CASES) {
    test(`${LABEL} ${lang} ${c.name}`, async ({ browser }, info) => {
      const opts = { viewport: { width: c.width, height: c.height }, reducedMotion: 'reduce' as const, deviceScaleFactor: 1 }
      const shot = { fullPage: c.full, mask: [] as ReturnType<Page['locator']>[], animations: 'disabled' as const }
      const a = await browser.newContext(opts)
      const pa = await a.newPage()
      await proto(pa, lang, c.name)
      await c.act?.(pa)
      const base = await pa.screenshot({ ...shot, mask: [pa.locator('.w-foot-bar > span:first-child')] })
      await a.close()
      const name = `${LABEL}-${lang}-${c.name}.png`
      const path = info.snapshotPath(name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, base)
      const b = await browser.newContext({ ...opts, baseURL: `http://127.0.0.1:${process.env.SITE_PORT ?? '8099'}` })
      const pb = await b.newPage()
      await site(pb, lang)
      await c.act?.(pb)
      await expect(pb).toHaveScreenshot(name, { ...shot, mask: [pb.locator('.w-foot-bar > span:first-child')], maxDiffPixelRatio: Number(process.env.PARITY_RATIO ?? 0.02) })
      await b.close()
    })
  }
}
