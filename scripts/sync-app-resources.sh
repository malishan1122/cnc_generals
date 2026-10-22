#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/C&C Generals Zero Hour.app/Contents/Resources"
rsync -a "$ROOT/index.html" "$ROOT/unit-studio.html" "$DEST/"
rsync -a --delete "$ROOT/css/" "$DEST/css/"
rsync -a --delete "$ROOT/js/" "$DEST/js/"
if [ -d "$ROOT/assets" ]; then
  rsync -a --delete "$ROOT/assets/" "$DEST/assets/"
fi
echo "Synced index.html, unit-studio.html, css/, js/, and assets/ to $DEST"
