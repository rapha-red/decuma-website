// Second half of the prototype sync: renders the product visuals of the shell and the start page from the running
// prototype at PROTOTYPE_COMMIT and keeps the HTML as partials per language, plus the compiled CSS of the website
// components as assets/css/site.css. A start-page visual that changes with a website flag is kept once per state of
// the flags it depends on (start-<name>[.<flag>...].html); data/capture.json lists those flags per visual. Usage: node checks/capture.mjs <prototype url, e.g. http://127.0.0.1:5180/>
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
const sauber = (h) => h.replace(/<!---->/g, '').replace(/ data-an="1"/g, '').replace(/<!--[\s\S]*?-->/g, '')

// start-page visuals: name -> selector inside main of #/web
const START = {
  hero: '.w-hero-visual > figure',
  'z-take': '[aria-labelledby=s-take] .w-sec-head > svg',
  ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`row${i}`, `[aria-labelledby=s-take] .w-row:nth-child(${i}) > div:last-child > *`])),
  'z-ok': '[aria-labelledby=s-ok] .w-sec-head > svg',
  verlauf: '[aria-labelledby=s-ok] .w-row > div:last-child > *',
  bots: '[aria-labelledby=s-ag] .bots',
  eigen: '[aria-labelledby=s-os] figure.w-eigen',
  dfy: '.w-dfy > svg',
}
const FLAGS = ALL.split(',')

const browser = await chromium.launch()
const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } })
let css = ''
let iconClass = ''
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
  iconClass ||= await page.locator('.w-nav button svg').first().getAttribute('class')
  css ||= await page.evaluate(() =>
    [...document.querySelectorAll('style[data-vite-dev-id]')]
      .filter((s) => /\/src\/web\/\w+\.svelte|\/src\/lib\/Icon\.svelte/.test(s.dataset.viteDevId))
      .map((s) => s.textContent)
      .join('\n'),
  )
}
// the start page in one flag state: visual name -> markup, null where it is not shown
const states = new Map()
async function start(l, on) {
  const key = l + ':' + on.join(',')
  if (!states.has(key)) {
    await page.goto(`${base}?lang=${l}&flags=${on.join(',') || 'aus'}#/web`)
    await page.locator('.w-hero').waitFor()
    const got = {}
    for (const [name, sel] of Object.entries(START)) {
      const el = page.locator('main ' + sel)
      got[name] = (await el.count()) ? sauber(await el.evaluate((e) => e.outerHTML)) : null
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
  for (const name of Object.keys(START)) {
    const d = []
    for (const f of FLAGS) if ((await start(l, [f]))[name] !== aus[name]) d.push(f)
    if (deps[name] && deps[name].join() !== d.join()) throw new Error(`${name}: flags differ between languages`)
    deps[name] = d
    for (const on of subsets(d)) {
      const html = (await start(l, on))[name]
      if (html !== null) writeFileSync(join(dir, ['start-' + name, ...on].join('.') + '.html'), html + '\n')
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
writeFileSync(join(site, 'data/capture.json'), JSON.stringify({ commit, icon_class: iconClass, deps }) + '\n')
console.log(`captured ${Object.keys(STUECKE).length * 2} menu fragments, start visuals (flags: ${JSON.stringify(deps)}) and ${css.length} bytes of component CSS at ${commit}`)
