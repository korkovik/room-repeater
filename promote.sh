#!/usr/bin/env bash
# ./promote.sh uat  : dev/index.html (+ dev/vendor/) -> uat/index.html (+ uat/vendor/)
# ./promote.sh prod : uat/index.html (+ uat/vendor/) -> index.html (+ vendor/) (LIVE)
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  uat)  src=dev/index.html; dst=uat/index.html ;;
  prod) src=uat/index.html; dst=index.html ;;
  *) echo "usage: $0 uat|prod" >&2; exit 2 ;;
esac
[ -s "$src" ] || { echo "missing $src" >&2; exit 1; }
cp "$src" "$dst"
# vendored libraries (e.g. vendor/supabase.min.js) travel with the page; the target copy is replaced, not merged
srcdir=$(dirname "$src"); dstdir=$(dirname "$dst")
if [ -d "$srcdir/vendor" ]; then rm -rf "$dstdir/vendor"; cp -R "$srcdir/vendor" "$dstdir/vendor"; fi
echo "promoted $src -> $dst ($(wc -c <"$dst" | tr -d ' ') bytes)"
