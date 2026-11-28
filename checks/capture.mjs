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
// ---- product pages (Seite.svelte, Gruendung.svelte, BotsSeite.svelte): each visual slot of a page as
// p-<page>-<slot>[--<flag>...].html, per state of the flags it depends on (deps, against the page's own flag on). Slots:
// hero, a<index of the section in data/pages/seiten.json>, and the named parts of Gründung and Bots. A work sequence (the
// hero's Ablauf, the KI chat) is kept as its markup before it plays plus one <template data-nach="<ms>"> per step, captured
// on the page's own clock (Playwright clock); assets/js/folge.js plays them. The last step must equal the reduced-motion end.
const seitenP = JSON.parse(readFileSync(join(site, 'data/pages/seiten.json'), 'utf8'))
const PROD = {}
for (const [k, s] of Object.entries(seitenP)) {
  if (k === 'open-source') continue
  PROD[k] = { route: k.startsWith('fuer-') ? '#/web/fuer/' + k.slice(5) : '#/web/' + k, flag: s.flag, slots: (on) => {
    const an = (f) => !f || (Array.isArray(f) ? f.some((x) => on.includes(x)) : on.includes(f))
    const out = {}
    if ((s.ablauf && an(s.ablauf.flag)) || s.visual) out.hero = '.w-hero-visual > *'
    s.abschnitte.filter((a) => an(a.flag)).forEach((a, i) => { if (a.visual) out['a' + s.abschnitte.indexOf(a)] = `[aria-labelledby=ab-${k}${i}] .w-row > div:last-child > *` })
    return out
  } }
}
PROD.gruendung = { route: '#/web/gruendung', slots: () => ({ hero: '.w-hero-visual > *', fb: '#fragebogen .w-row > div:last-child > *' }) }
PROD.bots = { route: '#/web/bots', flag: 'agent_tier', slots: () => ({ hero: '.w-hero-visual > *', k0: '.w-botkarte:nth-child(1) > svg', k1: '.w-botkarte:nth-child(2) > svg', k2: '.w-botkarte:nth-child(3) > svg', k3: '.w-botkarte:nth-child(4) > svg', eigen: '.w-komponist', ja: '.w-regeln', bericht: '[aria-labelledby=bp-bericht] .w-row > div:last-child > *' }) }
const SEQ = '.w-ablauf, .w-kichat'
const pstate = new Map()
let gruendungClass = ''
const styles = new Map()
async function prod(l, k, on) {
  const key = `${l}:${k}:${on.join(',')}`
  if (!pstate.has(key)) {
    const got = {}
    await page.goto(`${base}?lang=${l}&flags=${on.join(',') || 'aus'}${PROD[k].route}`)
    await page.locator('main > *').first().waitFor()
    const slots = PROD[k].flag && !on.includes(PROD[k].flag) ? {} : PROD[k].slots(on)
    for (const [slot, sel] of Object.entries(slots)) {
      const el = page.locator('main ' + sel)
      if ((await el.count()) !== 1) throw new Error(`${k} ${slot}: ${sel} matches ${await el.count()} elements`)
      got[slot] = sauber(await el.evaluate((e) => e.outerHTML))
    }
    for (const [id, text] of await page.evaluate(() => [...document.querySelectorAll('style[data-vite-dev-id]')].map((s) => [s.dataset.viteDevId, s.textContent]))) styles.set(id, text)
    if (k === 'gruendung') gruendungClass ||= (await page.locator('main .stapel').first().getAttribute('class')).match(/svelte-\w+/)[0]
    pstate.set(key, got)
  }
  return pstate.get(key)
}
// a sequence's steps: [markup before it plays, ...[ms since the step before, markup]]
async function folge(l, k, on, sel) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.clock.install({ time: new Date('2027-01-04T09:00:00') })
  await p.goto(`${base}?lang=${l}&flags=${on.join(',') || 'aus'}${PROD[k].route}`)
  const el = p.locator('main ' + sel)
  await el.waitFor()
  const html = () => el.evaluate((e) => e.outerHTML).then(sauber)
  const steps = [await html()]
  let last = steps[0], ms = 0, still = 0
  while (still < 5000) {
    await p.clock.runFor(100)
    ms += 100
    const h = await html()
    if (h !== last) { steps.push([ms, h]); last = h; ms = 0; still = 0 } else still += 100
  }
  await ctx.close()
  return steps
}
const pdeps = {}
const FL = ALL.split(',')
for (const l of ['de', 'en']) {
  const dir = join(site, 'layouts/partials/fragments', l)
  for (const k of Object.keys(PROD)) {
    const own = PROD[k].flag ? [PROD[k].flag] : []
    const basis = await prod(l, k, own)
    const d = {}
    for (const f of FL) {
      if (own.includes(f)) continue
      const g = await prod(l, k, [...own, f])
      for (const slot of new Set([...Object.keys(basis), ...Object.keys(g)])) if (g[slot] !== basis[slot]) (d[slot] ??= []).push(f)
    }
    // ponytail: a slot that shows only with two flags on together is missed; none does at this pin
    const slotsAll = new Set(Object.keys(basis))
    for (const f of FL) if (!own.includes(f)) Object.keys(await prod(l, k, [...own, f])).forEach((s) => slotsAll.add(s))
    for (const slot of slotsAll) {
      const name = `p-${k}-${slot}`
      const dd = [...own, ...(d[slot] ?? [])].sort((a, b) => FL.indexOf(a) - FL.indexOf(b))
      if (pdeps[name] && pdeps[name].join() !== dd.join()) throw new Error(`${name}: flags differ between languages`)
      pdeps[name] = dd
      for (const extra of subsets(d[slot] ?? [])) {
        const on = [...own, ...extra].sort((a, b) => FL.indexOf(a) - FL.indexOf(b))
        const html = (await prod(l, k, on))[slot]
        if (html == null) continue
        let out = html
        if (/^<[^>]*class="[^"]*\b(w-ablauf|w-kichat)\b/.test(html)) {
          const steps = await folge(l, k, on, PROD[k].slots(on)[slot])
          if (steps.at(-1)[1] !== html) throw new Error(`${name} ${on}: the last step is not the reduced-motion end state`)
          out = steps[0].replace(/^<(\w+)/, '<$1 data-folge') + steps.slice(1).map(([ms, h]) => `<template data-nach="${ms}">${h}</template>`).join('')
        }
        writeFileSync(join(dir, [name, ...extra].join('--') + '.html'), out + '\n')
      }
    }
  }
}
// drawings of the product pages that the open-source page does not show (Gründung: gruendung, voranmeldung)
for (const l of ['de', 'en']) {
  await page.goto(`${base}?lang=${l}&flags=${ALL}#/web/gruendung`)
  for (const [art, sel] of [['gruendung', '[aria-labelledby=g-why] .w-sec-head > svg'], ['voranmeldung', '[aria-labelledby=g-nach] .w-sec-head > svg']]) {
    const f = join(site, 'layouts/partials/fragments', l, `z-${art}.html`)
    writeFileSync(f, sauber(await page.locator('main ' + sel).evaluate((e) => e.outerHTML)) + '\n')
  }
}
// component rules are injected when a component first mounts: collect them after every page has been shown
for (const [id, text] of styles) if (/\/src\/web\/\w+\.svelte|\/src\/lib\/Icon\.svelte/.test(id) && !css.includes(text)) css += '\n' + text
Object.assign(deps, pdeps)
await browser.close()
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n')
writeFileSync(join(site, 'assets/css/site.css'), `/* compiled component rules of the website at ${commit}, captured by checks/capture.mjs; do not edit */\n${css}`)
writeFileSync(join(site, 'data/capture.json'), JSON.stringify({ commit, icon_class: iconClass, preise_class: preiseClass, recht_class: rechtClass, gruendung_class: gruendungClass, deps }) + '\n')
console.log(`captured ${Object.keys(STUECKE).length * 2} menu fragments, start visuals (flags: ${JSON.stringify(deps)}) and ${css.length} bytes of component CSS at ${commit}`)
