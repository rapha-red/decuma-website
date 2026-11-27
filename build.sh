#!/usr/bin/env bash
# The one build: pinned tools, Hugo into public/, the Knowledge Base search index, the checks. Stops at the first
# failure. Only step 1 goes online. Usage: ./build.sh [--no-browser] (skips the browser checks of check-site.sh).
set -euo pipefail
cd "$(dirname "$0")"
tools/fetch.sh
rm -rf public resources
tools/bin/hugo --minify --printI18nWarnings --panicOnWarning --logLevel warn
if compgen -G 'public/kb/*/*.html' >/dev/null; then tools/bin/pagefind --site public --glob 'kb/**/*.html' --quiet; fi
echo "tree $(./tools/treehash.sh public)"
./check-site.sh public "$@"
