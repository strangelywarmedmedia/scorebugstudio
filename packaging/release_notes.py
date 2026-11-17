#!/usr/bin/env python3
"""Print GitHub release notes for a version from CHANGELOG.md (and the plugin's latest entry).
   python packaging/release_notes.py 2.1.0"""
import os
import re
import sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def section(path, version=None):
    try:
        text = open(os.path.join(root, path), encoding="utf-8").read()
    except OSError:
        return None, None
    parts = re.split(r"(?m)^## ", text)[1:]
    for p in parts:
        head, _, body = p.partition("\n")
        m = re.match(r"([0-9][0-9.]*)", head.strip())
        if m and (version is None or m.group(1) == version):
            return m.group(1), body.strip()
    return None, None


ver = sys.argv[1] if len(sys.argv) > 1 else None
_, body = section("CHANGELOG.md", ver)
out = [body or "See CHANGELOG.md for what changed."]
pv, pbody = section("CHANGELOG-streamdeck.md")
if pbody:
    out.append(f"\n---\n**Stream Deck plugin {pv}** (`com.scorebugstudio.controller.streamDeckPlugin`)\n\n{pbody}")
out.append("\n---\n**Install:** Windows - run `ScorebugStudio-Setup-*.exe`. Mac - open the `.dmg` for your Mac "
           "(`arm64` = Apple Silicon M1/M2/M3/M4, `intel` = older Intel Macs) and drag Scorebug Studio to Applications. "
           "First launch is unsigned: see the README for the one-time steps.")
print("\n".join(out))
