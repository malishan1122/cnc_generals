#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/C&C Generals Zero Hour.app/Contents/Resources"
rsync -a "$ROOT/index.html" "$DEST/"
rsync -a --delete "$ROOT/css/" "$DEST/css/"
rsync -a --delete "$ROOT/js/" "$DEST/js/"
echo "Synced index.html, css/, and js/ to $DEST"
