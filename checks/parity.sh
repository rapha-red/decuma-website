#!/usr/bin/env bash
# Visual parity with the prototype: checks/parity.sh <clone of the design repository> [proto port]
# Builds the site twice (data/offer.json, and checks/offer-all-flags.json: the price list with every flag on), serves the prototype at
# PROTOTYPE_COMMIT and compares the shell and the pages (draft pages included). ONLY=<regex> limits the cases by name. Acceptance evidence, not part of every build. Shots in checks/.parity/.
set -euo pipefail
cd "$(dirname "$0")/.."
repo=$(realpath "$1")
export PROTO_PORT=${2:-5180}
commit=$(cat PROTOTYPE_COMMIT)
work=checks/.parity
rm -rf "$work" && mkdir -p "$work"
git -C "$repo" worktree remove --force "$PWD/$work/../.proto" 2>/dev/null || true
git -C "$repo" worktree add --detach --force "$PWD/checks/.proto" "$commit" >/dev/null
trap 'git -C "$repo" worktree remove --force "$PWD/checks/.proto"' EXIT
(cd checks/.proto/prototype/ui && npm ci --no-audit --no-fund --silent && npm run tokens --silent)
export PROTO_DIR=$PWD/checks/.proto/prototype/ui
FLAGS="model_steps agent_tier lohn bank source_link eric auftrag"
# kb_live is a switch of hugo.toml, the other flags come from the price list
on=$(python3 -c 'import json,sys,tomllib; f=json.load(open("data/offer.json"))["flags"]; p=tomllib.load(open("hugo.toml","rb"))["params"]; f={k: v or (p.get("show_all_flags") and k not in p["real_flags"]) for k, v in f.items()}; f["kb_live"]=p["kb_live"]; print(",".join(k for k in sys.argv[1:] if f[k]) or "aus")' $FLAGS kb_live)
stars=$(python3 -c 'import json; print(json.load(open("data/github.json"))["stars"])')
# a copy of the tree per flag state, with the prototype's sample entries as data/changelog.yaml and the legal pages
# without their bodies (the prototype has the frames only)
build() {
	local dir
	dir=$(mktemp -d)
	git ls-files -z | xargs -0 -I{} cp --parents {} "$dir"
	cp -r tools/bin "$dir/tools/"
	cp checks/changelog-sample.yaml "$dir/data/changelog.yaml"
	for f in "$dir"/content/{impressum,datenschutz,agb,avv,unterauftragnehmer}.md; do python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s[:s.index("---", 3) + 4])' "$f"; done
	if [ "$1" = all ]; then cp checks/offer-all-flags.json "$dir/data/offer.json"; sed -i 's/^kb_live = false/kb_live = true/' "$dir/hugo.toml"; cp -r checks/fixtures/kb/. "$dir/"; fi
	(cd "$dir" && tools/bin/hugo --minify --buildDrafts --logLevel error -d "$OLDPWD/$work/site-$1")
	rm -rf "$dir"
}
build offer
build all
rc=0
SITE_ROOT=$PWD/$work/site-offer LABEL=offer FLAGS=$on STARS=$stars npx --prefix checks playwright test -c checks/playwright.config.ts --pass-with-no-tests parity.spec.ts || rc=1
SITE_ROOT=$PWD/$work/site-all LABEL=all FLAGS=${FLAGS// /,},kb_live STARS=$stars npx --prefix checks playwright test -c checks/playwright.config.ts --pass-with-no-tests parity.spec.ts || rc=1
exit $rc
