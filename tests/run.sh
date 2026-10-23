#!/usr/bin/env bash
# Run every check. Exit code 0 means safe to publish.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 scripts/build.py > /dev/null
git diff --quiet -- index.html 2>/dev/null || { echo "index.html is out of date with src/. Run: python3 scripts/build.py"; [ -n "${CI:-}" ] && exit 1; }
node tests/extract.js index.html core "$TMP/core.js"
node tests/extract.js index.html ui "$TMP/ui.js"
node --check "$TMP/core.js" && node --check "$TMP/ui.js" && node --check desk/desk.js && echo "syntax ok"
node tests/logic.js "$TMP/core.js"
python3 -m json.tool manifest.webmanifest > /dev/null && echo "manifest ok"
node tests/browser.js
node tests/pro.js
echo "ALL CHECKS PASSED"
