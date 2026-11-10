#!/bin/bash
# build_mac.sh - builds a standalone Scorebug Studio app folder for macOS.
# Run this ON THE MAC that will run the broadcast (PyInstaller can't cross-compile).
# Needs Python 3 (python.org or Homebrew).
#
#   chmod +x build_mac.sh && ./build_mac.sh
set -e
cd "$(dirname "$0")"

echo "Installing build dependencies..."
python3 -m pip install --quiet pyserial websockets pyinstaller

echo "Building..."
python3 -m PyInstaller --onefile --name ScorebugStudio --console \
  --collect-submodules serial --collect-submodules websockets \
  --noconfirm --clean scorebug_server.py

echo "Assembling dist/ScorebugStudio-Mac ..."
OUT="dist/ScorebugStudio-Mac"
rm -rf "$OUT"; mkdir -p "$OUT"
mv dist/ScorebugStudio "$OUT/"
cp -R web "$OUT/web"
cp scorebug_config.json "$OUT/"
cp README.md "$OUT/" 2>/dev/null || true

echo ""
echo "Done. Your app folder: $OUT"
echo "Keep ScorebugStudio, the web folder and scorebug_config.json together."
echo "First launch: right-click ScorebugStudio -> Open -> Open (it is not signed)."
