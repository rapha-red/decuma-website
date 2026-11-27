// Second half of the prototype sync: renders the product visuals of the shell and the start page from the running
// prototype at PROTOTYPE_COMMIT and keeps the HTML as partials per language, plus the compiled CSS of the website
// components as assets/css/site.css. A page visual (start page, price page) that changes with a website flag is kept
// once per state of the flags it depends on (<page>-<name>[--<flag>...].html; Hugo would read a dot as an output format);
// data/capture.json lists those flags per visual. Usage: node checks/capture.mjs <prototype url, e.g. http://127.0.0.1:5180/>
// Re-run after tools/sync.mjs at every new pin; never edit the outputs by hand.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2]
if (!base) throw new Error('usage: node checks/capture.mjs <prototype url>')
const commit = readFileSync(join(site, 'PROTOTYPE_COMMIT'), 'utf8').trim().slice(0, 12)
const ALL = 'model_steps,agent_tier,lohn,bank,source_link,eric,auftrag'
const OHNE_AGENT = 'model_steps,lohn,bank,source_link,eric,auftrag'
// partial name -> flags, menu, element inside the menu card
const STUECKE = {
  'menu-frist': [ALL, 'produkt', '.w-menu-card > :first-child'],
  'menu-freigabe': [OHNE_AGENT, 'produkt', '.w-menu-card > :first-child'],
  'menu-gruendung': [ALL, 'gruendung', '.w-menu-card > :first-child'],
  'menu-eigen': [ALL, 'ressourcen', '.w-menu-card > :first-child'],
}
// runtime marks and framework comments are not part of the markup
// a decorative button of a visual gets its type, as every button of the site
const sauber = (h) => h.replace(/<!---->/g, '').replace(/ data-an="1"/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<button (?![^>]*\btype=)/g, '<button type="button" ')

// page visuals: partial name -> [route, selector inside main]
const START = {
  'start-hero': '.w-hero-visual > figure',
  'start-z-take': '[aria-labelledby=s-take] .w-sec-head > svg',
  ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`start-row${i}`, `[aria-labelledby=s-take] .w-row:nth-child(${i}) > div:last-child > *`])),
  'start-z-ok': '[aria-labelledby=s-ok] .w-sec-head > svg',
  'start-verlauf': '[aria-labelledby=s-ok] .w-row > div:last-child > *',
  'start-bots': '[aria-labelledby=s-ag] .bots',
  'start-eigen': '[aria-labelledby=s-os] figure.w-eigen',
  'start-dfy': '.w-dfy > svg',
}
const VISUALS = {
  ...Object.fromEntries(Object.entries(START).map(([n, sel]) => [n, ['#/web', sel]])),
  'preise-dfy': ['#/web/preise/service', '[aria-labelledby=d-take] .w-sec-head > svg'],
  'preise-selbsthosten': ['#/web/preise/service', '[aria-labelledby=d-opt] .w-sec-head > svg'],
}
const FLAGS = ALL.split(',')

const browser = await chromium.launch()
const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } })
let css = ''
let iconClass = ''
let rechtClass = ''
for (const l of ['de', 'en']) {
  for (const [name, [flags, menu, sel]] of Object.entries(STUECKE)) {
    await page.goto(`${base}?lang=${l}&flags=${flags}#/web`)
    await page.locator(`button[aria-controls=menu-${menu}]`).hover()
    // a form value set as a property is written into the markup
    const html = await page.locator(`#menu-${menu} ${sel}`).evaluate((e) => {
      e.querySelectorAll('input').forEach((i) => i.setAttribute('value', i.value))
      return e.outerHTML
    })
    mkdirSync(join(site, 'layouts/partials/fragments', l), { recursive: true })
    writeFileSync(join(site, 'layouts/partials/fragments', l, name + '.html'), sauber(html) + '\n')
  }
  // the line drawings (Zeichnung.svelte) by name, z-<art>.html, from the open-source page with every flag on (a drawing
  // never changes with a flag): each section head and row that names one in data/pages/seiten.json
  const seiten = JSON.parse(readFileSync(join(site, 'data/pages/seiten.json'), 'utf8'))
  await page.goto(`${base}?lang=${l}&flags=${ALL}#/web/open-source`)
  await page.locator('main .w-sec').first().waitFor()
  const zeichnungen = new Map()
  seiten['open-source'].abschnitte.forEach((a, i) => {
    const sec = `main [aria-labelledby=ab-open-source${i}]`
    if (a.z) zeichnungen.set(a.z, `${sec} .w-sec-head > svg`)
    for (const b of a.bloecke) (b.zeilen ?? []).forEach((z, j) => z.z && !zeichnungen.has(z.z) && zeichnungen.set(z.z, `${sec} .w-zeile:nth-child(${j + 1}) > svg`))
  })
  for (const [art, sel] of zeichnungen) writeFileSync(join(site, 'layouts/partials/fragments', l, `z-${art}.html`), sauber(await page.locator(sel).evaluate((e) => e.outerHTML)) + '\n')
  // the scope class of the data promise and legal frames (Recht.svelte's rules in site.css)
  await page.goto(`${base}?lang=${l}#/web/datenversprechen`)
  rechtClass ||= (await page.locator('main .recht').getAttribute('class')).match(/svelte-\w+/)[0]
  iconClass ||= await page.locator('.w-nav button svg').first().getAttribute('class')
  css ||= await page.evaluate(() =>
    [...document.querySelectorAll('style[data-vite-dev-id]')]
      .filter((s) => /\/src\/web\/\w+\.svelte|\/src\/lib\/Icon\.svelte/.test(s.dataset.viteDevId))
      .map((s) => s.textContent)
      .join('\n'),
  )
}
// the pages in one flag state: visual name -> markup, null where it is not shown
const states = new Map()
let preiseClass = ''
async function start(l, on) {
  const key = l + ':' + on.join(',')
  if (!states.has(key)) {
    const got = {}
    for (const route of new Set(Object.values(VISUALS).map(([r]) => r))) {
      await page.goto(`${base}?lang=${l}&flags=${on.join(',') || 'aus'}${route}`)
      await page.locator('main > *').first().waitFor()
      for (const [name, [r, sel]] of Object.entries(VISUALS)) {
        if (r !== route) continue
        const el = page.locator('main ' + sel)
        got[name] = (await el.count()) ? sauber(await el.evaluate((e) => e.outerHTML)) : null
      }
      // the scope class of the price page's own rules (.w-ansicht, .os, .stapel in site.css)
      if (route === '#/web/preise/service') preiseClass ||= (await page.locator('main .w-ansicht').getAttribute('class')).match(/svelte-\w+/)[0]
    }
    states.set(key, got)
  }
  return states.get(key)
}
const subsets = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]])
const deps = {}
for (const l of ['de', 'en']) {
  const dir = join(site, 'layouts/partials/fragments', l)
  const aus = await start(l, [])
  for (const name of Object.keys(VISUALS)) {
    const d = []
    for (const f of FLAGS) if ((await start(l, [f]))[name] !== aus[name]) d.push(f)
    if (deps[name] && deps[name].join() !== d.join()) throw new Error(`${name}: flags differ between languages`)
    deps[name] = d
    for (const on of subsets(d)) {
      const html = (await start(l, on))[name]
      if (html !== null) writeFileSync(join(dir, [name, ...on].join('--') + '.html'), html + '\n')
    }
  }
  // the hero chat (model_steps): its markup before it plays, then the inside of each of its steps
  const motion = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await motion.goto(`${base}?lang=${l}&flags=${ALL}#/web`)
  const chat = motion.locator('.chat-app')
  await chat.waitFor()
  const vorher = sauber(await chat.evaluate((e) => e.outerHTML))
  if (!vorher.includes('data-stufe="0"')) throw new Error('the chat started before it was captured')
  writeFileSync(join(dir, 'start-chat.html'), vorher + '\n')
  for (let i = 1; i <= 6; i++) {
    await motion.locator(`.chat-app[data-stufe="${i}"]`).waitFor()
    writeFileSync(join(dir, `start-chat-${i}.html`), sauber(await chat.evaluate((e) => e.innerHTML)) + '\n')
  }
  await motion.close()
}
await browser.close()
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n')
writeFileSync(join(site, 'assets/css/site.css'), `/* compiled component rules of the website at ${commit}, captured by checks/capture.mjs; do not edit */\n${css}`)
writeFileSync(join(site, 'data/capture.json'), JSON.stringify({ commit, icon_class: iconClass, preise_class: preiseClass, recht_class: rechtClass, deps }) + '\n')
console.log(`captured ${Object.keys(STUECKE).length * 2} menu fragments, start visuals (flags: ${JSON.stringify(deps)}) and ${css.length} bytes of component CSS at ${commit}`)
