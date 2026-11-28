#!/usr/bin/env bash
# One hash over a built tree: path and content of every file, in a fixed order.
set -euo pipefail
cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
