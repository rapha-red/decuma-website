#!/usr/bin/env bash
# Checks of a built tree: check-site.sh <tree> [--no-browser]. Called by build.sh and by the ship script of the
# hosted repository on the tree it is about to ship. With DECUMA_BIN set (the release about to ship), its price list
# must equal data/offer.json leaf by leaf, and its --all-flags list checks/offer-all-flags.json (the all-flags copy of
# the browser and parity checks).
set -euo pipefail
tree=$(realpath "$1")
cd "$(dirname "$0")"
python3 checks/check_site.py "$tree" .
if [ -n "${DECUMA_BIN:-}" ]; then
	leaves() { python3 -c 'import json,sys
def w(p,v):
    if isinstance(v,dict): [w(p+"/"+k,x) for k,x in sorted(v.items())]
    elif isinstance(v,list): [w(p+"/"+str(i),x) for i,x in enumerate(v)]
    else: print(p, json.dumps(v))
w("", json.load(sys.stdin))'; }
	for f in "data/offer.json:data/offer.json" "checks/offer-all-flags.json:--all-flags"; do
		if ! d=$(diff <(leaves < "${f%%:*}") <("$DECUMA_BIN" price-list "${f#*:}" | leaves)); then
			echo "FAIL offer: ${f%%:*} differs from $DECUMA_BIN price-list ${f#*:} (< file, > binary)" >&2
			echo "$d" >&2
			exit 1
		fi
		echo "offer: ${f%%:*} equals the price list (${f#*:}) of $DECUMA_BIN"
	done
fi
[ "${2:-}" = "--no-browser" ] && exit 0
[ -d checks/node_modules ] || npm --prefix checks ci --no-audit --no-fund
SITE_ROOT="$tree" npm --prefix checks test --silent
