#!/usr/bin/env python3
"""Static checks of a built site tree (Python standard library only).

usage: check_site.py <tree> [<repository>]

Fails, naming the page and the URL, on: a request to another origin (src, srcset, stylesheet/preload/icon href,
@import and url() in CSS the page loads or carries, iframe, script, form action); an inline script other than
JSON-LD; an internal link or asset that does not resolve in the tree; a page outside /kb without canonical or
without its hreflang partner, a /kb page with a partner or an /en/ copy; a missing llms.txt, robots.txt (or one with
Disallow) or sitemap.xml; a price of data/offer.json typed into layouts/, i18n/ or data/pages/; an internal decision
id or private path in the tree.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

SITE_HOSTS = {"decuma.de"}
CSS_URL = re.compile(r"""@import\s+(?:url\()?\s*['"]?([^'")\s;]+)|url\(\s*['"]?([^'")]+)['"]?\s*\)""", re.I)
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
        self.loads, self.links, self.css, self.alternates = [], [], [], {}
        self.canonical, self.inline_scripts, self.styles = None, 0, []
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
    if (tree / "en/kb").exists():
        fails.append("/en/kb: the Knowledge Base has no English pages")
    for name in ("llms.txt", "robots.txt", "sitemap.xml"):
        if not (tree / name).is_file():
            fails.append(f"/{name}: missing")
    if (tree / "robots.txt").is_file() and re.search(r"(?im)^\s*Disallow\s*:\s*\S", (tree / "robots.txt").read_text()):
        fails.append("/robots.txt: Disallow")
    for f in sorted(tree.rglob("*")):
        if f.is_file() and f.suffix in (".html", ".css", ".js", ".txt", ".xml", ".json", ".md"):
            for m in INTERNAL.finditer(f.read_text(errors="replace")):
                fails.append(f"/{f.relative_to(tree).as_posix()}: internal reference {m.group(0)}")
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
    for x in fails:
        print("FAIL " + x)
    print(f"check_site: {len(pages)} pages, {len(fails)} findings")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
