#!/usr/bin/env python3
"""Print the app version from scorebug_server.py; with a tag argument (v2.1.0) fail if they differ."""
import os
import re
import sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ver = re.search(r'VERSION = "([^"]+)"', open(os.path.join(root, "scorebug_server.py"), encoding="utf-8").read()).group(1)
if len(sys.argv) > 1 and sys.argv[1].startswith("v"):
    if sys.argv[1][1:] != ver:
        sys.exit(f"ERROR: release tag is {sys.argv[1]} but scorebug_server.py says VERSION = \"{ver}\". "
                 f"Change VERSION in scorebug_server.py (and CHANGELOG.md) to match, then tag again.")
print(ver)
