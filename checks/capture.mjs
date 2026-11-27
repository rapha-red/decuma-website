// Second half of the prototype sync: renders the product visuals of the shell from the running prototype at
// PROTOTYPE_COMMIT and keeps the HTML as partials per language, plus the compiled CSS of the website components as
// assets/css/site.css. Usage: node checks/capture.mjs <prototype url, e.g. http://127.0.0.1:5180/>
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
await browser.close()
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n')
writeFileSync(join(site, 'assets/css/site.css'), `/* compiled component rules of the website at ${commit}, captured by checks/capture.mjs; do not edit */\n${css}`)
writeFileSync(join(site, 'data/capture.json'), JSON.stringify({ commit, icon_class: iconClass }) + '\n')
console.log(`captured ${Object.keys(STUECKE).length * 2} fragments and ${css.length} bytes of component CSS at ${commit}`)
