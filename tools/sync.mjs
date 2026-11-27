#!/usr/bin/env node
// Prototype sync: carries the design layer, strings, page structures and icons of the prototype at PROTOTYPE_COMMIT into
// the site. Usage: node tools/sync.mjs <path to a clone of the design repository> [commit]. With a commit it also writes
// that commit to PROTOTYPE_COMMIT first. Re-running it at a new commit is how prototype changes arrive; nothing here is
// edited by hand. Needs Node 22 (type stripping); the build itself never runs it.
//
// Writes: assets/css/{fonts,tokens,app,display,website}.css (rules unchanged, comments dropped, a first line naming the
// commit, font urls pointing at /fonts/), static/fonts/ (woff2 and licences), static/icon.svg, i18n/{de,en}.yaml,
// data/pages/{seiten,recht}.json, data/icons.json, data/meta.json (titles and descriptions from the copy deck's Meta
// table, keyed by the German address).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const [repo, neu] = process.argv.slice(2)
if (!repo) throw new Error('usage: node tools/sync.mjs <design repository> [commit]')
if (neu) writeFileSync(join(site, 'PROTOTYPE_COMMIT'), execFileSync('git', ['-C', repo, 'rev-parse', neu + '^{commit}']).toString())
const commit = readFileSync(join(site, 'PROTOTYPE_COMMIT'), 'utf8').trim()

const tmp = mkdtempSync(join(tmpdir(), 'sync-'))
const ui = 'prototype/ui/src'
execFileSync('sh', ['-c', `git -C "$1" archive "$2" design-system docs/specs/website-copy.md ${ui}/lib/strings ${ui}/lib/Icon.svelte ${ui}/web/Gh.svelte ${ui}/app.css | tar -x -C "$3"`, 'x', repo, commit, tmp])
const out = (p, s) => (mkdirSync(dirname(join(site, p)), { recursive: true }), writeFileSync(join(site, p), s))

// ---- design layer: rules unchanged; comments dropped (the public site carries no internal references)
const kopf = (src) => `/* ${src.split('/').pop()} of the design source at ${commit.slice(0, 12)}, synced by tools/sync.mjs; do not edit */\n`
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n')
const css = { fonts: 'design-system/fonts/fonts.css', tokens: 'design-system/tokens.css', app: `${ui}/app.css`, display: 'design-system/fonts/display.css', website: 'design-system/website.css' }
for (const [name, src] of Object.entries(css)) {
  out(`assets/css/${name}.css`, kopf(src) + ohneKommentare(readFileSync(join(tmp, src), 'utf8')).replaceAll('url(./', 'url(/fonts/'))
}
mkdirSync(join(site, 'static/fonts'), { recursive: true })
for (const f of readdirSync(join(tmp, 'design-system/fonts'))) if (/\.(woff2|txt)$/.test(f)) copyFileSync(join(tmp, 'design-system/fonts', f), join(site, 'static/fonts', f))
copyFileSync(join(tmp, 'design-system/icon.svg'), join(site, 'static/icon.svg'))

// ---- strings: every string module in the order the prototype merges them, then the keys the website uses
const dir = join(tmp, ui, 'lib/strings')
for (const f of readdirSync(dir)) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace(/from '(\.\/[a-z0-9]+)'/g, "from '$1.ts'"))
const order = execFileSync('git', ['-C', repo, 'show', `${commit}:${ui}/lib/i18n.svelte.ts`]).toString().match(/const ALL: Strings = \{([^}]*)\}/)[1].match(/\.\.\.(\w+)/g).map((s) => s.slice(3))
const all = {}
for (const m of order) Object.assign(all, (await import(pathToFileURL(join(dir, m + '.ts')).href))[m])
const PREFIX = /^(w|pr|tier|sv|nav|cat|kz|q|v|pos|actor)\./
const go = (s) =>
  s
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, n, one, many) => `{{ if eq .${n} 1 }}${one}{{ else }}${many}{{ end }}`)
    .replace(/\{(\w+)\}/g, (_, n) => `{{ .${n} }}`)
for (const [i, l] of ['de', 'en'].entries()) {
  const keys = Object.keys(all).filter((k) => PREFIX.test(k) && !/D-\d{3}/.test(all[k].join(' '))).sort() // a line naming an internal decision is prototype-only
  out(`i18n/${l}.yaml`, `# synced from the prototype at ${commit.slice(0, 12)} by tools/sync.mjs; do not edit\n` + keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(go(all[k][i]))}\n`).join(''))
}

// ---- page structures
const seiten = await import(pathToFileURL(join(dir, 'seiten.ts')).href)
const recht = await import(pathToFileURL(join(dir, 'recht.ts')).href)
out('data/pages/seiten.json', JSON.stringify(seiten.SEITEN, null, 1) + '\n')
out('data/pages/recht.json', JSON.stringify({ DV: recht.DV, RECHT: recht.RECHT, RECHT_TEXT: recht.RECHT_TEXT, RECHT_EN_HINWEIS: recht.RECHT_EN_HINWEIS }, null, 1) + '\n')

// ---- icons: the 20 px line set and the GitHub mark, as path data
const icon = readFileSync(join(tmp, ui, 'lib/Icon.svelte'), 'utf8')
const paths = Object.fromEntries([...icon.matchAll(/^\s+(\w+): '([^']+)',$/gm)].map((m) => [m[1], m[2]]))
const gh = readFileSync(join(tmp, ui, 'web/Gh.svelte'), 'utf8').match(/<path d="([^"]+)"/)[1]
out('data/icons.json', JSON.stringify({ paths, github: gh }, null, 1) + '\n')

// ---- titles and descriptions: the Meta table of the copy deck. A title may carry " | Decuma" (or " | Decuma Knowledge
// Base"), which splits its cell; such a brand cell is joined back to the title before it.
const deck = readFileSync(join(tmp, 'docs/specs/website-copy.md'), 'utf8').split(/^## Meta$/m)[1].split(/^## /m)[0]
const meta = {}
for (const line of deck.split('\n').filter((l) => /^\| .* \| `#\//.test(l))) {
  const c = line.slice(2, -2).split(' | ')
  const [page, , path] = c
  const titles = c.slice(3, -2).reduce((a, x) => (/^Decuma( Knowledge Base)?$/.test(x) ? a.with(-1, a.at(-1) + ' | ' + x) : [...a, x]), [])
  if (titles.length !== 2) throw new Error(`Meta: cannot read the titles of ${page}`)
  meta[path.replaceAll('`', '')] = { title: titles, description: c.slice(-2) }
}
out('data/meta.json', JSON.stringify(meta, null, 1) + '\n')

rmSync(tmp, { recursive: true, force: true })
console.log(`synced ${commit.slice(0, 12)}: ${Object.keys(paths).length} icons, ${Object.keys(all).filter((k) => PREFIX.test(k)).length} strings, ${Object.keys(seiten.SEITEN).length} pages`)
