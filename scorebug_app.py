#!/usr/bin/env python3
"""Scorebug Studio - desktop launcher.

Starts the server in the background and puts an icon in the system tray (Windows) or
menu bar (macOS) with shortcuts. This is what the installers run; from source you can
still run scorebug_server.py directly.

  python scorebug_app.py              start with the tray icon
  python scorebug_app.py --no-tray    no icon (headless / testing)
"""
import argparse
import asyncio
import os
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser

import scorebug_server as sb


def find_icon():
    for d in (sb.resource_dir(), os.path.join(sb.resource_dir(), "packaging")):
        p = os.path.join(d, "icon.png")
        if os.path.isfile(p):
            return p
    return None


def port_in_use(port):
    s = socket.socket()
    s.settimeout(0.5)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def copy_text(text):
    try:
        if sys.platform == "win32":
            subprocess.run(["clip"], input=text.encode("utf-16le"), check=False, creationflags=0x08000000)
        elif sys.platform == "darwin":
            subprocess.run(["pbcopy"], input=text.encode(), check=False)
        else:
            subprocess.run(["xclip", "-selection", "clipboard"], input=text.encode(), check=False)
    except Exception:
        pass


def open_folder(path):
    try:
        if sys.platform == "win32":
            os.startfile(path)  # noqa
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser(description="Scorebug Studio")
    ap.add_argument("--no-tray", action="store_true", help="run without the tray / menu-bar icon")
    ap.add_argument("--no-browser", action="store_true", help="don't open the control panel on start")
    ap.add_argument("--reset", action="store_true", help="ignore the saved game state")
    args = ap.parse_args()

    base = sb.user_dir()
    os.makedirs(base, exist_ok=True)
    if getattr(sys, "frozen", False):  # no console window: keep a log so problems can be diagnosed
        try:
            logdir = os.path.join(base, "logs")
            os.makedirs(logdir, exist_ok=True)
            lf = open(os.path.join(logdir, "scorebug.log"), "a", buffering=1, encoding="utf-8")
            sys.stdout = sys.stderr = lf
            print("\n--- started", time.strftime("%Y-%m-%d %H:%M:%S"), "---")
        except Exception:
            pass

    app = sb.App(base, os.path.join(base, "scorebug_config.json"))
    scfg = app.cfg["server"]
    http_port = scfg["http_port"]
    panel = f"http://localhost:{http_port}/control.html"

    if port_in_use(http_port):  # already running: just bring up the control panel
        webbrowser.open(panel)
        return
    if args.reset:
        app.state = sb.default_state()

    problem = {}

    def run_server():
        try:
            ns = argparse.Namespace(no_browser=True, reset=False)
            asyncio.run(sb.amain(app, ns))
        except SystemExit as e:
            problem["msg"] = str(e.code) if e.code else "stopped"
        except BaseException:
            problem["msg"] = traceback.format_exc()
        print("server stopped:", problem.get("msg", ""))

    threading.Thread(target=run_server, daemon=True).start()
    t0 = time.time()
    while time.time() - t0 < 15 and not port_in_use(http_port) and "msg" not in problem:
        time.sleep(0.2)
    if "msg" in problem:
        print(problem["msg"])
        sys.exit(1)

    def shutdown():
        try:
            app.save_state()
            app.bridge.stop()
        finally:
            os._exit(0)

    if not args.no_browser:
        webbrowser.open(panel)

    if args.no_tray:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            shutdown()

    try:
        import pystray
        from PIL import Image
    except Exception:
        print("Tray icon unavailable; running without it.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            shutdown()

    def other_devices_text(_=None):
        if not app.allow_network:
            return "Other devices: off (turn on in the Style tab)"
        ips = sb.lan_addresses()
        return "Other devices: " + (f"http://{ips[0]}:{http_port}" if ips else "on")

    def stats_url():
        ips = sb.lan_addresses()
        return f"http://{ips[0] if ips and app.allow_network else 'localhost'}:{http_port}/stats.html"

    img_path = find_icon()
    img = Image.open(img_path).convert("RGBA") if img_path else Image.new("RGBA", (64, 64), (255, 194, 14, 255))
    img = img.resize((64, 64))
    menu = pystray.Menu(
        pystray.MenuItem("Open control panel", lambda i, it: webbrowser.open(panel), default=True),
        pystray.MenuItem("Open Stat Keeper", lambda i, it: webbrowser.open(f"http://localhost:{http_port}/stats.html")),
        pystray.MenuItem("Copy OBS overlay link", lambda i, it: copy_text(f"http://localhost:{http_port}/overlay.html")),
        pystray.MenuItem(other_devices_text, lambda i, it: webbrowser.open(panel), enabled=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open data folder", lambda i, it: open_folder(base)),
        pystray.MenuItem(f"Scorebug Studio {sb.VERSION}", None, enabled=False),
        pystray.MenuItem("Quit", lambda i, it: (i.stop(), shutdown())),
    )
    icon = pystray.Icon("ScorebugStudio", img, "Scorebug Studio", menu)
    icon.run()  # blocks on the main thread (required on macOS)
    shutdown()


if __name__ == "__main__":
    main()
