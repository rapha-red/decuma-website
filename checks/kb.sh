#!/usr/bin/env bash
# The check build of the Knowledge Base: a copy of the repository with the fixtures of checks/fixtures/kb/ as the kb
# export (content/kb/, static/kb/, data/kb_export.json) and kb_live on, built and checked by build.sh (Hugo, Pagefind,
# check_site.py, html-validate, browser checks). The fixtures never enter content/ or static/ of the repository.
# Usage: checks/kb.sh [--no-browser]. KEEP=<dir> keeps the built copy there.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=${KEEP:-$(mktemp -d)}
[ -n "${KEEP:-}" ] || trap 'rm -rf "$dir"' EXIT
mkdir -p "$dir"
git ls-files -co --exclude-standard -z | xargs -0 -I{} cp --parents {} "$dir"
cp -r tools/bin "$dir/tools/"
ln -sfn "$PWD/checks/node_modules" "$dir/checks/node_modules"
cp -r checks/fixtures/kb/. "$dir/"
sed -i 's/^kb_live = false/kb_live = true/' "$dir/hugo.toml"
"$dir/build.sh" "$@"
