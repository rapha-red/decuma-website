#!/usr/bin/env python3
"""Static checks of a built site tree (Python standard library only).

usage: check_site.py <tree> [<repository>]

Fails, naming the page and the URL, on: a request to another origin (src, srcset, stylesheet/preload/icon href,
@import and url() in CSS the page loads or carries, iframe, script, form action); an inline script other than
JSON-LD; an internal link or asset that does not resolve in the tree; a page outside /kb without canonical or
without its hreflang partner, hreflang that is not reciprocal (self, partner built and pointing back, x-default the German
page; sitemap.xml alternates equal to the page's), a link on an English page that leaves /en/ (except the Knowledge Base
and the language switch, both hreflang="de"), a /kb page with a partner or an /en/ copy; a missing llms.txt, robots.txt (or one with
Disallow) or sitemap.xml; a price of data/offer.json typed into layouts/, i18n/ or data/pages/; an internal decision
id or private path in the tree; a looping motion (an `infinite` CSS animation, `setInterval` or
`requestAnimationFrame` in a script); a `<script src>` outside the first-party set (a non-essential script is listed
in data/consent.yaml and injected by consent.js after consent, never written into a page); a registered script that is
not a first-party file of the tree; a placeholder of the legal frames (data/pages/recht.json) on a built page, unless
SITE_DRAFT=1 (local review only); while source_link is off in data/offer.json, a page or line about the open source
(the /open-source page, the repository address, "Open Source", "AGPL"); while kb_live is off in hugo.toml, a link to
/kb (a page, sitemap.xml, llms.txt).
"""
import json
import os
import re
import tomllib
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

SITE_HOSTS = {"decuma.de"}
CSS_URL = re.compile(r"""@import\s+(?:url\()?\s*['"]?([^'")\s;]+)|url\(\s*['"]?([^'")]+)['"]?\s*\)""", re.I)
FIRST_PARTY_JS = re.compile(r"^/js/(?:anim|hero|menu|consent|search|plans|columns|folge)(?:\.min)?(?:\.[0-9a-f]{64})?\.js$|^/pagefind/")
INTERNAL = re.compile(r"\bD-\d{3}\b|prototype/ui|docs/(?:specs|adr|requirements)|decuma-personal|/home/\w+")


def external(url):
    u = urlsplit(url.strip())
    if u.scheme in ("data", "blob", "mailto", "tel"):
        return False
    if url.strip().startswith("//"):
        return u.hostname not in SITE_HOSTS
    return bool(u.scheme) and u.hostname not in SITE_HOSTS


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.loads, self.links, self.css, self.alternates, self.anchors = [], [], [], {}, []
        self.canonical, self.inline_scripts, self.styles, self.scripts, self.registry = None, 0, [], [], None
        self._style = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        rel = (a.get("rel") or "").lower().split()
        if a.get("style"):
            self.styles.append(a["style"])
        if tag == "style":
            self._style = True
        for k in ("src", "poster", "data"):
            if a.get(k):
                self.loads.append(a[k])
        if a.get("srcset"):
            self.loads += [s.strip().split()[0] for s in a["srcset"].split(",") if s.strip()]
        if tag == "form" and a.get("action"):
            self.loads.append(a["action"])
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if "data-consent" in a:
            self.registry = json.loads(a.get("data-scripts") or "[]")
        if tag == "script" and not a.get("src") and a.get("type") != "application/ld+json":
            self.inline_scripts += 1
        if tag == "link" and a.get("href"):
            if "canonical" in rel:
                self.canonical = a["href"]
            elif "alternate" in rel and a.get("hreflang"):
                self.alternates[a["hreflang"]] = a["href"]
            elif rel and not {"alternate"} & set(rel):
                self.loads.append(a["href"])
                if "stylesheet" in rel:
                    self.css.append(a["href"])
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
            self.anchors.append((a["href"], a.get("hreflang")))

    def handle_endtag(self, tag):
        if tag == "style":
            self._style = False

    def handle_data(self, data):
        if self._style:
            self.styles.append(data)


def resolve(tree, path):
    """The file the server answers for an address (as checks/Caddyfile: path.html, path/index.html, path)."""
    p = unquote(urlsplit(path).path).lstrip("/")
    for c in (p + ".html", p.rstrip("/") + "/index.html", p):
        f = tree / c
        if c and f.is_file():
            return f
    return tree / "index.html" if p == "" else None


def address(tree, f):
    rel = "/" + f.relative_to(tree).as_posix()
    rel = rel[: -len("index.html")] if rel.endswith("/index.html") else rel[: -len(".html")]
    return rel if rel in ("/", "/en/") else rel.rstrip("/")


def prices(repo):
    o = json.loads((repo / "data/offer.json").read_text())
    vals = set()
    for p in o.get("plans", []):
        vals |= {p.get(k) for k in ("monthly", "yearly_per_month", "yearly", "intro")}
    vals |= {o.get("einkommensteuererklaerung")}
    out = set()
    for v in vals:
        try:
            x = float(v)
        except (TypeError, ValueError):
            continue
        if x <= 0:
            continue
        de = f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        en = f"{x:,.2f}"
        forms = [f"{de} €", f"€{en}"]
        if x == int(x):
            forms += [f"{int(x):,} €".replace(",", "."), f"€{int(x):,}"]
        out |= set(forms)
    return out


def main():
    tree = Path(sys.argv[1]).resolve()
    repo = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent)
    fails = []
    pages = sorted(f for f in tree.rglob("*.html") if f.name != "404.html" and not f.relative_to(tree).as_posix().startswith("pagefind/"))
    css_cache = {}
    alts = {}  # address -> its hreflang alternates, as addresses
    filled = {}  # address -> whether its <main> has content (a partner pair is filled on both sides or neither)

    def css_external(css_file):
        if css_file not in css_cache:
            css_cache[css_file] = [m.group(1) or m.group(2) for m in CSS_URL.finditer(css_file.read_text(errors="replace"))]
        return [u for u in css_cache[css_file] if external(u)]

    for f in pages + sorted(tree.rglob("404.html")):
        page = address(tree, f)
        p = Page()
        p.feed(f.read_text(errors="replace"))
        for u in p.loads:
            if external(u):
                fails.append(f"{page}: request to another origin: {u}")
        for s in p.styles:
            for m in CSS_URL.finditer(s):
                u = m.group(1) or m.group(2)
                if external(u):
                    fails.append(f"{page}: request to another origin in an inline style: {u}")
        for href in p.css:
            if not external(href):
                c = resolve(tree, href)
                for u in css_external(c) if c else []:
                    fails.append(f"{page}: request to another origin from {href}: {u}")
        for u in p.scripts:
            if not FIRST_PARTY_JS.match(u):
                fails.append(f"{page}: script outside the first-party set: {u} (register it in data/consent.yaml)")
        for s in p.registry or []:
            if not s["src"].startswith("/") or s["src"].startswith("//") or not resolve(tree, s["src"]):
                fails.append(f"{page}: registered script {s['src']} is not a first-party file of the site (CSP: own origin only)")
        if p.inline_scripts:
            fails.append(f"{page}: {p.inline_scripts} inline script(s)")
        for u in p.links + p.loads:
            if external(u) or u.startswith(("#", "mailto:", "tel:", "data:", "http")) or not urlsplit(u).path:
                continue
            if not resolve(tree, u if u.startswith("/") else "/" + u):
                fails.append(f"{page}: broken link {u}")
        if f.name == "404.html":
            continue
        kb = page == "/kb" or page.startswith("/kb/")
        if kb:
            if set(p.alternates) - {"x-default"}:
                fails.append(f"{page}: a Knowledge Base page has a language partner")
        else:
            if not p.canonical:
                fails.append(f"{page}: no canonical")
            other = "en" if not page.startswith("/en/") else "de"
            if other not in p.alternates or "x-default" not in p.alternates:
                fails.append(f"{page}: no hreflang partner ({other}, x-default)")
            alts[page] = {k: urlsplit(v).path or "/" for k, v in p.alternates.items()}
            m = re.search(r"<main>(.*?)</main>", f.read_text(errors="replace"), re.S)
            filled[page] = bool(m and m.group(1).strip())
            if page.startswith("/en/"):
                # an English page links inside /en/, except the German-only Knowledge Base (hreflang="de"), the language
                # switch (hreflang="de"), llms.txt and the assets
                for h, hl in p.anchors:
                    u = urlsplit(h)
                    if external(h) or u.scheme or not u.path.startswith("/") or u.path.startswith("/en/") or u.path == "/llms.txt":
                        continue
                    if hl != "de":
                        fails.append(f"{page}: link {h} leaves /en/ without hreflang=\"de\"")
    # hreflang: each page lists itself, its partner (built) and x-default (the German page), and the partner lists the same
    for page, a in sorted(alts.items()):
        lang = "en" if page.startswith("/en/") else "de"
        if a.get(lang) != page:
            fails.append(f"{page}: hreflang {lang} is {a.get(lang)}, not the page itself")
        if a.get("x-default") != a.get("de"):
            fails.append(f"{page}: hreflang x-default {a.get('x-default')} is not the German page {a.get('de')}")
        for l in ("de", "en"):
            if a.get(l) and a[l] != page and alts.get(a[l]) != a:
                fails.append(f"{page}: hreflang {l} {a[l]} is not built or does not point back ({alts.get(a[l])})")
            elif a.get(l) and filled[page] and not filled.get(a[l], True):
                fails.append(f"{page}: its partner {a[l]} has an empty <main> (layout missing in its content file?)")
    sm = tree / "sitemap.xml"
    if sm.is_file():
        for loc, body in re.findall(r"<url><loc>([^<]+)</loc>(.*?)</url>", re.sub(r">\s+<", "><", sm.read_text())):
            page = urlsplit(loc).path or "/"
            got = {m[0]: urlsplit(m[1]).path or "/" for m in re.findall(r'hreflang="([^"]+)" href="([^"]+)"', body)}
            if page in alts and got != alts[page]:
                fails.append(f"/sitemap.xml: alternates of {page} {got} differ from the page's {alts[page]}")
    if (tree / "en/kb").exists():
        fails.append("/en/kb: the Knowledge Base has no English pages")
    for name in ("llms.txt", "robots.txt", "sitemap.xml"):
        if not (tree / name).is_file():
            fails.append(f"/{name}: missing")
    # The server answers 404 for dotfiles and the ship refuses a tree with one or with a symlink: fail here first.
    for f in sorted(tree.rglob("*")):
        rel = f.relative_to(tree)
        parts = rel.parts[1:] if rel.parts[0] == ".well-known" else rel.parts
        if f.is_symlink() or any(x.startswith(".") for x in parts):
            fails.append(f"/{rel.as_posix()}: {'symlink' if f.is_symlink() else 'dotfile'} in the tree")
    if (tree / "robots.txt").is_file() and re.search(r"(?im)^\s*Disallow\s*:\s*\S", (tree / "robots.txt").read_text()):
        fails.append("/robots.txt: Disallow")
    for f in sorted(tree.rglob("*")):
        if f.is_file() and f.suffix in (".html", ".css", ".js", ".txt", ".xml", ".json", ".md"):
            for m in INTERNAL.finditer(f.read_text(errors="replace")):
                fails.append(f"/{f.relative_to(tree).as_posix()}: internal reference {m.group(0)}")
    for f in sorted(tree.rglob("*")):
        if f.is_file() and f.suffix in (".css", ".js", ".html") and not f.relative_to(tree).as_posix().startswith("pagefind/"):
            for m in re.finditer(r"\binfinite\b|\bsetInterval\b|\brequestAnimationFrame\b", f.read_text(errors="replace")):
                fails.append(f"/{f.relative_to(tree).as_posix()}: looping motion ({m.group(0)})")
    lit = prices(repo)
    # lines that carry the same number without being a price, each with its reason (checks/price-literal-allow.txt)
    allow = [l.split("\t")[0] for l in (repo / "checks/price-literal-allow.txt").read_text().splitlines() if l.strip() and not l.startswith("#")]
    for d in ("layouts", "i18n", "data/pages"):
        for f in sorted((repo / d).rglob("*")):
            if f.is_file() and "fragments" not in f.parts:
                for n, line in enumerate(f.read_text(errors="replace").replace("\u00a0", " ").splitlines(), 1):
                    for x in sorted(lit):
                        if re.search(r"(?<![\d.,€])" + re.escape(x) + r"(?![\d]|[.,]\d)", line) and not any(a in line for a in allow):
                            fails.append(f"{f.relative_to(repo)}:{n}: price literal {x} (amounts come from data/offer.json)")
    # the go-live guard: no legal frame placeholder ({Text dieses Abschnitts}, {datum}, ...) on a built page
    recht = (repo / "data/pages/recht.json").read_text()
    holders = set(re.findall(r"\{[^{}\"]+\}", recht))
    # and the open placeholders of the legal texts themselves ({Anzahl}, ...)
    legal = set()  # the built legal texts (German body, also shown on the English page)
    for f in (repo / "content").glob("*.md"):
        if re.search(r"^layout: recht$", f.read_text(), re.M) and f.read_text().split("---", 2)[-1].strip():
            holders |= set(re.findall(r"\{[^{}\"\n]+\}", f.read_text().split("---", 2)[-1]))
            legal.add(re.search(r"^translationKey: (\S+)", f.read_text(), re.M).group(1))
    legal_pages = {f"{f.name.removesuffix('.en.md')}.html" if not f.name.endswith(".en.md") else f"en/{f.name.removesuffix('.en.md')}.html"
                   for f in (repo / "content").glob("*.md") if (m := re.search(r"^translationKey: (\S+)", f.read_text(), re.M)) and m.group(1) in legal}
    legal_pages = {x.replace(".md.html", ".html") for x in legal_pages}
    draft = os.environ.get("SITE_DRAFT") == "1"
    held = 0
    for f in pages:
        text = f.read_text(errors="replace")
        for h in sorted(x for x in holders if x in text):
            held += 1
            if not draft:
                fails.append(f"placeholder on {address(tree, f)}: {h}")
    if draft and held:
        print(f"check_site: SITE_DRAFT=1, {held} legal placeholders allowed (never ship this tree)")
    # nothing about the open source while its flag is off
    if not json.loads((repo / "data/offer.json").read_text())["flags"]["source_link"]:
        repo_url = tomllib.loads((repo / "hugo.toml").read_text())["params"]["repo"]
        about = re.compile(r"open[ -]?source|\bAGPL|" + re.escape(repo_url.split("://", 1)[1]), re.I)
        for f in sorted(tree.rglob("*")):
            # the legal texts describe the final offer, the open source licence included (owner)
            if f.is_file() and f.suffix in (".html", ".txt", ".xml", ".md") and not f.relative_to(tree).as_posix().startswith("pagefind/") and f.relative_to(tree).as_posix() not in legal_pages:
                for m in about.finditer(f.read_text(errors="replace")):
                    fails.append(f"/{f.relative_to(tree).as_posix()}: source_link is off but the page says {m.group(0)!r}")
    # the Knowledge Base is not linked while kb_live is off in hugo.toml: no <a href> to /kb, no /kb in sitemap.xml or llms.txt
    if not tomllib.loads((repo / "hugo.toml").read_text())["params"].get("kb_live"):
        to_kb = re.compile(r"""href=["'](?:https://decuma\.de)?/kb(?:[/"'?#.])|<loc>https://decuma\.de/kb\b|\]\(https://decuma\.de/kb\b""")
        for f in sorted(tree.rglob("*")):
            if f.is_file() and f.suffix in (".html", ".txt", ".xml") and not f.relative_to(tree).as_posix().startswith(("kb/", "pagefind/")):
                for m in to_kb.finditer(f.read_text(errors="replace")):
                    fails.append(f"/{f.relative_to(tree).as_posix()}: kb_live is off but it links the Knowledge Base: {m.group(0)}")
    for x in fails:
        print("FAIL " + x)
    print(f"check_site: {len(pages)} pages, {len(fails)} findings")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
