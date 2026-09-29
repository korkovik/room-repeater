#!/usr/bin/env bash
# Family Buddy promotion (architecture.md §3–§5, spec C12).
#   scripts/promote.sh uat   validate --release, then copy dev/ -> uat/ (replaced, not merged)
#   scripts/promote.sh prod  refused: PROD lives only in the korkovik/family-buddy repo (option a),
#                            where Tom merges the uat -> main pull request.
# Run from anywhere; commit and push the result to the dev branch yourself.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  uat)
    # C12: fails while any reviewed.by is not on scripts/reviewers.json or any {{placeholder}} remains.
    node scripts/validate-content.mjs --release
    [ -s dev/index.html ] || { echo "missing dev/index.html" >&2; exit 1; }
    rm -rf uat
    mkdir uat
    # App files only: everything under dev/ is served as-is (no build step).
    cp -R dev/. uat/
    echo "promoted family-buddy/dev -> family-buddy/uat ($(find uat -type f | wc -l | tr -d ' ') files)"
    ;;
  prod)
    echo "refusing: Family Buddy PROD is served only from korkovik/family-buddy (architecture.md §5, TOM merges uat -> main)" >&2
    exit 2
    ;;
  *)
    echo "usage: $0 uat|prod" >&2
    exit 2
    ;;
esac
