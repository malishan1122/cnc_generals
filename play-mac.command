#!/bin/zsh
# ============================================================================
# Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
# Native macOS Launcher Script
# ============================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BUNDLE="$DIR/C&C Generals Zero Hour.app"

if [ -x "$APP_BUNDLE/Contents/MacOS/CnCGeneralsZeroHour" ]; then
  open "$APP_BUNDLE"
else
  open "$DIR/index.html"
fi
