#!/usr/bin/env bash
# Checks of a built tree: check-site.sh <tree> [--no-browser]. Called by build.sh and by the ship script of the
# hosted repository on the tree it is about to ship. With DECUMA_BIN set (the release about to ship), its price list
# must equal data/offer.json leaf by leaf.
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
	if ! d=$(diff <(leaves < data/offer.json) <("$DECUMA_BIN" price-list data/offer.json | leaves)); then
		echo "FAIL offer: data/offer.json differs from $DECUMA_BIN price-list (< file, > binary)" >&2
		echo "$d" >&2
		exit 1
	fi
	echo "offer: data/offer.json equals the price list of $DECUMA_BIN"
fi
[ "${2:-}" = "--no-browser" ] && exit 0
[ -d checks/node_modules ] || npm --prefix checks ci --no-audit --no-fund
SITE_ROOT="$tree" npm --prefix checks test --silent
