#!/usr/bin/env bash
# ./promote.sh uat  : dev/index.html -> uat/index.html
# ./promote.sh prod : uat/index.html -> index.html (LIVE)
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  uat)  src=dev/index.html; dst=uat/index.html ;;
  prod) src=uat/index.html; dst=index.html ;;
  *) echo "usage: $0 uat|prod" >&2; exit 2 ;;
esac
[ -s "$src" ] || { echo "missing $src" >&2; exit 1; }
cp "$src" "$dst"
echo "promoted $src -> $dst ($(wc -c <"$dst" | tr -d ' ') bytes)"
