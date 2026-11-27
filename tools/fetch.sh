#!/usr/bin/env bash
# Fetch the pinned tools of tools/versions into tools/bin/, checksum each archive, stop on a mismatch.
# The only step of the build that goes online; a tool already present at its version is kept.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin
grep -v '^#' versions | while read -r name version url sha; do
	[ -n "$name" ] || continue
	if [ -x "bin/$name" ] && [ "$(cat "bin/.$name.version" 2>/dev/null)" = "$version $sha" ]; then continue; fi
	tmp=$(mktemp -d)
	trap 'rm -rf "$tmp"' EXIT
	curl -fsSL -o "$tmp/a.tar.gz" "$url"
	got=$(sha256sum "$tmp/a.tar.gz" | cut -d' ' -f1)
	if [ "$got" != "$sha" ]; then echo "FAIL fetch: $name $version sha256 $got, expected $sha" >&2; exit 1; fi
	tar -xzf "$tmp/a.tar.gz" -C "$tmp" "$name"
	install -m 0755 "$tmp/$name" "bin/$name"
	echo "$version $sha" > "bin/.$name.version"
	rm -rf "$tmp"
	echo "fetched $name $version"
done
