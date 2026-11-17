#!/usr/bin/env python3
"""Build the Scorebug Studio desktop app for the OS you are on.

  pip install -r requirements-build.txt
  python packaging/build.py

Output goes to dist/. The GitHub workflow (.github/workflows/release.yml) runs this on
Windows and macOS and then wraps the result in an installer.
"""
import os
import subprocess
import sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(root)
subprocess.check_call([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
                       "--distpath", "dist", "--workpath", "build",
                       os.path.join("packaging", "ScorebugStudio.spec")])
print("\nBuilt:", os.path.join(root, "dist"))
