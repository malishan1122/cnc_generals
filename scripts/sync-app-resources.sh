#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/C&C Generals Zero Hour.app/Contents/Resources"
rsync -a "$ROOT/index.html" "$ROOT/unit-studio.html" "$ROOT/usa-buildings-diorama.html" "$DEST/"
if [ -f "$ROOT/usa-units-diorama.html" ]; then
  rsync -a "$ROOT/usa-units-diorama.html" "$DEST/"
fi
rsync -a --delete "$ROOT/css/" "$DEST/css/"
rsync -a --delete "$ROOT/js/" "$DEST/js/"
if [ -d "$ROOT/assets" ]; then
  rsync -a --delete "$ROOT/assets/" "$DEST/assets/"
fi
rm -rf "$DEST/tests" "$DEST/OBLIGATION_LEDGER.md"
echo "Synced index.html, unit-studio.html, usa-buildings-diorama.html, usa-units-diorama.html, css/, js/, and assets/ to $DEST (cleaned non-runtime files)"

