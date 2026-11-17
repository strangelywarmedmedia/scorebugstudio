# PyInstaller spec - builds the Scorebug Studio desktop app (folder build) on the current OS.
#   Windows: dist/ScorebugStudio/ScorebugStudio.exe     (then wrapped by Inno Setup)
#   macOS:   dist/Scorebug Studio.app                   (then wrapped into a .dmg)
# Run through packaging/build.py rather than directly.
import os
import re
import sys
from PyInstaller.utils.hooks import collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
VERSION = os.environ.get("APP_VERSION") or re.search(r'VERSION = "([^"]+)"', open(os.path.join(ROOT, "scorebug_server.py")).read()).group(1)

hidden = collect_submodules("serial") + collect_submodules("websockets")
try:
    hidden += collect_submodules("pystray")
except Exception:
    pass

a = Analysis(
    [os.path.join(ROOT, "scorebug_app.py")],
    pathex=[ROOT],
    datas=[(os.path.join(ROOT, "web"), "web"), (os.path.join(ROOT, "packaging", "icon.png"), ".")],
    hiddenimports=hidden,
    excludes=["tkinter", "unittest", "pydoc_data"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="ScorebugStudio",
    console=False,
    icon=os.path.join(ROOT, "packaging", "icon.ico") if sys.platform == "win32" else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="ScorebugStudio")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="Scorebug Studio.app",
        icon=os.path.join(ROOT, "packaging", "icon.icns"),
        bundle_identifier="com.scorebugstudio.app",
        info_plist={
            "CFBundleName": "Scorebug Studio",
            "CFBundleDisplayName": "Scorebug Studio",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "LSUIElement": True,          # menu-bar app: no Dock icon
            "NSHighResolutionCapable": True,
        },
    )
