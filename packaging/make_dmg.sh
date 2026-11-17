#!/bin/bash
# Wraps dist/"Scorebug Studio.app" into a drag-to-Applications disk image.
#   bash packaging/make_dmg.sh 2.1.0 arm64      -> dist-installer/ScorebugStudio-2.1.0-mac-arm64.dmg
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:?version}"; ARCH="${2:?arch (arm64 or intel)}"
APP="dist/Scorebug Studio.app"
[ -d "$APP" ] || { echo "Build the app first: python packaging/build.py"; exit 1; }
# ad-hoc signature (free): lets the app run on Apple Silicon. It is NOT notarized, so first launch
# needs right-click > Open (see README).
codesign --force --deep --sign - "$APP"
mkdir -p dist-installer
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
OUT="dist-installer/ScorebugStudio-$VER-mac-$ARCH.dmg"
rm -f "$OUT"
hdiutil create -volname "Scorebug Studio" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
rm -rf "$STAGE"
echo "Built $OUT"
