#!/usr/bin/env python3
"""
Scorebug Studio - server

One program that:
  * holds the authoritative game state (scores, clock, period, sport details)
  * serves the control panel (control.html) and the OBS overlay (overlay.html)
  * pushes live updates to both over a local WebSocket
  * optionally imports data from a FairPlay scoreboard controller over serial,
    field by field, while everything else stays under manual control

Run:   python3 scorebug_server.py
Then:  open http://localhost:8000/control.html
OBS:   Browser Source -> http://localhost:8000/overlay.html  (1920 x 1080)
"""
import argparse
import asyncio
import copy
import json
import os
import re
import sys
import threading
import time
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    import serial
    import serial.tools.list_ports
except ImportError:  # the app still runs in manual mode without pyserial
    serial = None

try:
    import websockets
except ImportError:
    sys.exit("Missing dependency. Install with: pip install websockets pyserial")

VERSION = "2.0"

# --------------------------------------------------------------------------
# Defaults
# --------------------------------------------------------------------------
SPORTS = {
    "football":   {"periodMs": 12 * 60 * 1000, "toMax": 3, "tenths": False, "dir": -1},
    "basketball": {"periodMs": 8 * 60 * 1000,  "toMax": 5, "tenths": True,  "dir": -1},
    "baseball":   {"periodMs": 0,               "toMax": 0, "tenths": False, "dir": -1},
    "volleyball": {"periodMs": 0,               "toMax": 2, "tenths": False, "dir": -1},
    # soccer: two halves (40:00 is the high-school default - change it in Style), 10:00 extra-time halves,
    # clock counts UP through the match (second half starts at 2 x half length) unless switched to count down
    "soccer":     {"periodMs": 40 * 60 * 1000, "toMax": 0, "tenths": False, "dir": 1, "otMs": 10 * 60 * 1000},
}

DEFAULT_CONFIG = {
    "serial": {"port": "", "baud": 9600, "bytesize": 8, "parity": "N", "stopbits": 1},
    "protocol": {"frame_length": None, "start_marker": None, "fields": {}},
    "server": {"host": "127.0.0.1", "http_port": 8000, "ws_port": 8765},
}

# (config field name, label shown in the control panel)
SERIAL_TARGETS = [
    ("home_score", "Home score"),
    ("guest_score", "Away score"),
    ("period", "Period / quarter / set"),
    ("clock_minutes", "Clock minutes"),
    ("clock_seconds", "Clock seconds"),
    ("clock_tenths", "Clock tenths"),
    ("down", "Down"),
    ("to_go", "Yards to go"),
    ("home_timeouts", "Home timeouts left"),
    ("guest_timeouts", "Away timeouts left"),
    ("home_fouls", "Home team fouls"),
    ("guest_fouls", "Away team fouls"),
    ("inning", "Inning"),
    ("balls", "Balls"),
    ("strikes", "Strikes"),
    ("outs", "Outs"),
    ("home_sets", "Home sets won"),
    ("guest_sets", "Away sets won"),
]
SERIAL_PATHS = {
    "home_score": ("teams", "home", "score"),
    "guest_score": ("teams", "away", "score"),
    "period": ("period",),
    "down": ("game", "down"),
    "to_go": ("game", "toGo"),
    "home_timeouts": ("teams", "home", "timeouts"),
    "guest_timeouts": ("teams", "away", "timeouts"),
    "home_fouls": ("teams", "home", "fouls"),
    "guest_fouls": ("teams", "away", "fouls"),
    "inning": ("game", "inning"),
    "balls": ("game", "balls"),
    "strikes": ("game", "strikes"),
    "outs": ("game", "outs"),
    "home_sets": ("game", "sets", "home"),
    "guest_sets": ("game", "sets", "away"),
}
ENCODINGS = ("raw_int", "bcd", "ascii_digit")


def new_team(name, abbr, color, color2, toMax=3):
    return {
        "name": name, "abbr": abbr, "record": "",
        "color": color, "color2": color2,
        "logo": "", "logoPlate": "none",
        "score": 0, "timeouts": toMax, "fouls": 0,
    }


def default_game(toMax=3):
    return {
        "down": 1, "toGo": "10", "ballOn": "", "possession": "",
        "toMax": toMax,
        "inning": 1, "half": "top", "balls": 0, "strikes": 0, "outs": 0,
        "bases": [False, False, False],
        "bestOf": 5, "sets": {"home": 0, "away": 0}, "setScores": [],
        # soccer
        "stoppage": 0,
        "cards": {"home": {"yellow": 0, "red": 0}, "away": {"yellow": 0, "red": 0}},
        "pens": {"active": False, "home": [], "away": []},
    }


def default_style():
    return {
        "position": "top-left", "offsetX": 0, "offsetY": 0, "scale": 1.0,
        "homeFirst": False, "nameMode": "name",
        "panel": "#0f1319", "accent": "#ffc20e",
        "showClock": True,
    }


def default_state():
    sp = SPORTS["football"]
    return {
        "sport": "football",
        "visible": True,
        "source": "manual",
        "teams": {
            "home": new_team("HOME", "HOM", "#0b3d91", "#ffffff", sp["toMax"]),
            "away": new_team("AWAY", "AWY", "#b3122c", "#ffffff", sp["toMax"]),
        },
        "clock": {"ms": sp["periodMs"], "running": False, "anchor": 0, "dir": sp["dir"],
                  "periodMs": sp["periodMs"], "otMs": sp.get("otMs", sp["periodMs"]), "tenths": sp["tenths"]},
        "period": 1,
        "periodText": "",
        "game": default_game(sp["toMax"]),
        "styles": {name: default_style() for name in SPORTS},
        "banner": {"text": "", "visible": False, "color": ""},
    }


# Only these state paths may be written with a generic "set"/"inc" message.
SETTABLE = ("teams.", "period", "periodText", "game.", "styles.", "banner.",
            "visible", "clock.periodMs", "clock.otMs", "clock.tenths")


def deep_merge(base, over):
    out = copy.deepcopy(base)
    if not isinstance(over, dict):
        return out
    for k, v in over.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        elif k in out and not isinstance(out[k], dict) and isinstance(v, dict):
            continue
        else:
            out[k] = copy.deepcopy(v)
    return out


def coerce(cur, v):
    """Convert an incoming value to the type of the value it replaces."""
    if isinstance(cur, bool):
        return v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes", "on")
    if isinstance(cur, int):
        return int(float(v))
    if isinstance(cur, float):
        return float(v)
    if isinstance(cur, str):
        return str(v)
    return v


# --------------------------------------------------------------------------
# Serial protocol decoding
# --------------------------------------------------------------------------
def decode_field(frame, fc):
    offset = int(fc["offset"])
    length = int(fc.get("length") or 1)
    encoding = fc.get("encoding", "raw_int")
    chunk = frame[offset:offset + length]
    if len(chunk) < length:
        return None
    if encoding == "raw_int":
        value = 0
        for b in chunk:
            value = (value << 8) | b
        return value
    if encoding == "bcd":
        value = 0
        for b in chunk:
            hi, lo = (b >> 4) & 0x0F, b & 0x0F
            if hi > 9 or lo > 9:
                return None
            value = value * 100 + hi * 10 + lo
        return value
    if encoding == "ascii_digit":
        digits = "".join(chr(b) for b in chunk if 48 <= b <= 57)
        return int(digits) if digits else None
    return None


def parse_frame(frame, protocol_cfg):
    """Decode every configured field. Non-dict entries (e.g. old '_notes'
    strings) and fields without an offset are skipped."""
    out = {}
    for name, fc in (protocol_cfg.get("fields") or {}).items():
        if not isinstance(fc, dict) or fc.get("offset") in (None, ""):
            continue
        try:
            v = decode_field(frame, fc)
        except Exception:
            v = None
        if isinstance(v, int):
            out[name] = v
    return out


class FrameParser:
    """Slices a raw byte stream into fixed-length frames, optionally
    re-syncing on a start-marker byte."""

    def __init__(self, frame_length, start_marker=None):
        self.n = int(frame_length) if frame_length else 0
        self.marker = start_marker
        self.buf = bytearray()

    def feed(self, data):
        frames = []
        if not self.n:
            self.buf.clear()
            return frames
        self.buf.extend(data)
        while True:
            if self.marker is not None:
                i = self.buf.find(bytes([self.marker]))
                if i < 0:
                    self.buf.clear()
                    break
                if i > 0:
                    del self.buf[:i]
            if len(self.buf) < self.n:
                break
            frames.append(bytes(self.buf[:self.n]))
            del self.buf[:self.n]
        if len(self.buf) > 8192:
            self.buf.clear()
        return frames


def hex_str(data):
    return " ".join(f"{b:02X}" for b in data)


class SerialBridge:
    """Background thread that reads the scoreboard controller."""

    def __init__(self, app):
        self.app = app
        self.thread = None
        self.stop_evt = None

    def configure(self):
        self.stop()
        scfg = self.app.cfg["serial"]
        if serial is None:
            self.app.set_serial_status("unavailable", "pyserial is not installed")
            return
        if not scfg.get("port"):
            self.app.set_serial_status("idle", "No serial port selected")
            return
        self.stop_evt = threading.Event()
        cfg = copy.deepcopy(self.app.cfg)
        self.thread = threading.Thread(target=self._run, args=(cfg, self.stop_evt), daemon=True)
        self.thread.start()

    def stop(self):
        if self.stop_evt:
            self.stop_evt.set()
        if self.thread:
            self.thread.join(timeout=1.5)
        self.thread = self.stop_evt = None

    def _run(self, cfg, stop_evt):
        app = self.app
        scfg, pcfg = cfg["serial"], cfg["protocol"]
        parser = FrameParser(pcfg.get("frame_length"), pcfg.get("start_marker"))
        tail = bytearray()
        total = frames = 0
        while not stop_evt.is_set():
            try:
                ser = serial.Serial(port=scfg["port"], baudrate=int(scfg["baud"]),
                                    bytesize=int(scfg["bytesize"]), parity=scfg["parity"],
                                    stopbits=int(scfg["stopbits"]), timeout=0.2)
            except Exception as e:
                app.set_serial_status("error", f"Cannot open {scfg['port']}: {e}")
                stop_evt.wait(2.0)
                continue
            app.set_serial_status("connected", f"Listening on {scfg['port']} @ {scfg['baud']}")
            try:
                while not stop_evt.is_set():
                    chunk = ser.read(256)
                    if not chunk:
                        continue
                    total += len(chunk)
                    tail.extend(chunk)
                    del tail[:-128]
                    last = None
                    for frame in parser.feed(chunk):
                        frames += 1
                        last = frame
                        values = parse_frame(frame, pcfg)
                        app.loop.call_soon_threadsafe(app.on_frame, values)
                    app.update_serial_raw(total, frames, hex_str(tail), hex_str(last) if last else None)
            except Exception as e:
                app.set_serial_status("error", f"Serial error: {e}")
                stop_evt.wait(2.0)
            finally:
                try:
                    ser.close()
                except Exception:
                    pass


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
def app_dir():
    """Folder holding config/, web/ and data/. Next to the executable when
    frozen with PyInstaller, otherwise next to this script."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def now_ms():
    return time.time() * 1000.0


class App:
    def __init__(self, base_dir, config_path):
        self.base_dir = base_dir
        self.config_path = config_path
        self.data_dir = os.path.join(base_dir, "data")
        os.makedirs(self.data_dir, exist_ok=True)
        self.cfg = self.load_config()
        self.state = self.load_state()
        self.library = self.load_library()
        self.clients = set()
        self.loop = None
        self.dirty = False
        self.bridge = SerialBridge(self)
        self.serial_status = {"state": "idle", "message": "", "bytes": 0, "frames": 0,
                              "raw": "", "lastFrame": ""}
        self.serial_values = {}
        self.serial_prev = {}
        self._serial_push_pending = False
        self._banner_timer = None

    # ---- persistence ----------------------------------------------------
    def load_config(self):
        cfg = copy.deepcopy(DEFAULT_CONFIG)
        try:
            with open(self.config_path, encoding="utf-8") as f:
                cfg = deep_merge(cfg, json.load(f))
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Warning: could not read {self.config_path}: {e}")
        return cfg

    def save_config(self):
        out = {k: self.cfg[k] for k in ("serial", "protocol", "server")}
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)

    def load_state(self):
        st = default_state()
        try:
            with open(os.path.join(self.data_dir, "state.json"), encoding="utf-8") as f:
                st = deep_merge(st, json.load(f))
        except Exception:
            pass
        st["clock"]["running"] = False
        st["clock"]["anchor"] = now_ms()
        st["source"] = "manual"
        if st["sport"] not in SPORTS:
            st["sport"] = "football"
        return st

    def save_state(self):
        try:
            tmp = os.path.join(self.data_dir, "state.json.tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.state, f)
            os.replace(tmp, os.path.join(self.data_dir, "state.json"))
        except Exception as e:
            print("Could not save state:", e)

    def load_library(self):
        try:
            with open(os.path.join(self.data_dir, "teams.json"), encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception:
            return []

    def save_library(self):
        with open(os.path.join(self.data_dir, "teams.json"), "w", encoding="utf-8") as f:
            json.dump(self.library, f)

    # ---- broadcasting ---------------------------------------------------
    async def send_all(self, payload):
        if not self.clients:
            return
        text = json.dumps(payload)
        await asyncio.gather(*(c.send(text) for c in list(self.clients)), return_exceptions=True)

    async def publish(self):
        self.dirty = True
        await self.send_all({"type": "state", "t": int(now_ms()), "state": self.state})

    def serial_payload(self):
        return {"type": "serial", "available": serial is not None,
                "status": self.serial_status, "values": self.serial_values,
                "config": {"serial": self.cfg["serial"], "protocol": self.cfg["protocol"]},
                "targets": SERIAL_TARGETS}

    async def push_serial(self):
        self._serial_push_pending = False
        await self.send_all(self.serial_payload())

    def schedule_serial_push(self):
        # called on the event-loop thread
        if self._serial_push_pending:
            return
        self._serial_push_pending = True
        self.loop.call_later(0.25, lambda: asyncio.ensure_future(self.push_serial()))

    def set_serial_status(self, state, message):  # thread-safe
        self.serial_status.update(state=state, message=message)
        self.loop.call_soon_threadsafe(self.schedule_serial_push)

    def update_serial_raw(self, total, frames, raw, last):  # thread-safe
        self.serial_status.update(bytes=total, frames=frames, raw=raw)
        if last:
            self.serial_status["lastFrame"] = last
        self.loop.call_soon_threadsafe(self.schedule_serial_push)

    # ---- clock ----------------------------------------------------------
    def clock_ms(self):
        c = self.state["clock"]
        ms = c["ms"] + c["dir"] * (now_ms() - c["anchor"]) if c["running"] else c["ms"]
        return max(0.0, ms)

    def clock_set(self, ms, running=None):
        c = self.state["clock"]
        c["ms"] = max(0, int(ms))
        c["anchor"] = now_ms()
        if running is not None:
            c["running"] = running

    def clock_start(self):
        c = self.state["clock"]
        if c["running"] or (c["dir"] < 0 and self.clock_ms() <= 0):
            return
        c["anchor"] = now_ms()
        c["running"] = True

    def clock_stop(self):
        c = self.state["clock"]
        c["ms"] = int(self.clock_ms())
        c["anchor"] = now_ms()
        c["running"] = False

    async def clock_watch(self):
        while True:
            await asyncio.sleep(0.05)
            c = self.state["clock"]
            if c["running"] and c["dir"] < 0 and self.clock_ms() <= 0:
                c["ms"] = 0
                c["running"] = False
                c["anchor"] = now_ms()
                await self.publish()

    async def saver(self):
        while True:
            await asyncio.sleep(2.0)
            if self.dirty:
                self.dirty = False
                self.save_state()

    # ---- state edits ----------------------------------------------------
    @staticmethod
    def _child(node, key):
        """Returns (found, value) for a dict key or list index."""
        if isinstance(node, dict):
            return (key in node), node.get(key)
        if isinstance(node, list):
            try:
                i = int(key)
                return (0 <= i < len(node)), node[i]
            except (ValueError, IndexError):
                return False, None
        return False, None

    def _resolve(self, path):
        if not any(path == p or path.startswith(p) for p in SETTABLE):
            return None
        parts = path.split(".")
        node = self.state
        for p in parts[:-1]:
            ok, node = self._child(node, p)
            if not ok:
                return None
        ok, cur = self._child(node, parts[-1])
        if not ok:
            return None
        key = int(parts[-1]) if isinstance(node, list) else parts[-1]
        return node, key, cur

    def set_path(self, path, value):
        r = self._resolve(path)
        if not r:
            return False
        node, key, cur = r
        try:
            node[key] = coerce(cur, value)
        except (TypeError, ValueError):
            return False
        return True

    def inc_path(self, path, delta, lo=None, hi=None):
        r = self._resolve(path)
        if not r or isinstance(r[2], (bool, str)) or r[2] is None:
            return False
        node, key, cur = r
        v = cur + delta
        if lo is not None:
            v = max(lo, v)
        if hi is not None:
            v = min(hi, v)
        node[key] = type(cur)(v)
        return True

    # ---- actions --------------------------------------------------------
    # ---- period / clock helpers (soccer counts through the match, so its periods start at different clock values)
    def period_len(self, p):
        c = self.state["clock"]
        if self.state["sport"] == "soccer" and p > 2:
            return c.get("otMs") or c["periodMs"]
        return c["periodMs"]

    def period_base(self, p):
        """soccer, counting up: clock value at the start of period p (1st half 0, 2nd half = one half, extra time after two halves)"""
        c = self.state["clock"]
        half = c["periodMs"]
        ot = c.get("otMs") or half
        if p <= 1:
            return 0
        if p == 2:
            return half
        return 2 * half + (p - 3) * ot

    def period_start_ms(self, p):
        c = self.state["clock"]
        if self.state["sport"] == "soccer":
            return self.period_base(p) if c["dir"] > 0 else self.period_len(p)
        return c["periodMs"]

    def new_game(self, sport_changed=False):
        s = self.state
        sp = SPORTS[s["sport"]]
        best_of = s["game"].get("bestOf", 5)
        for side in ("home", "away"):
            t = s["teams"][side]
            t.update(score=0, timeouts=sp["toMax"], fouls=0)
        s["period"] = 1
        s["periodText"] = ""
        c = s["clock"]
        # a new game in the same sport keeps the period length / direction you set; switching sport loads that sport's defaults
        if sport_changed or not c.get("periodMs"):
            c.update(periodMs=sp["periodMs"], otMs=sp.get("otMs", sp["periodMs"]), tenths=sp["tenths"], dir=sp["dir"])
        c.update(running=False, anchor=now_ms())
        c["ms"] = self.period_start_ms(1)
        s["game"] = default_game(sp["toMax"])
        s["game"]["bestOf"] = best_of

    def do_action(self, name, a):
        s, g, T = self.state, self.state["game"], self.state["teams"]
        c = s["clock"]
        if name == "clock_start":
            self.clock_start()
        elif name == "clock_stop":
            self.clock_stop()
        elif name == "clock_toggle":
            self.clock_stop() if c["running"] else self.clock_start()
        elif name == "clock_set":
            self.clock_set(float(a["ms"]), running=False)
        elif name == "clock_adjust":
            self.clock_set(self.clock_ms() + float(a["delta"]), running=c["running"])
        elif name == "clock_reset":
            self.clock_set(self.period_start_ms(s["period"]), running=False)
        elif name == "clock_dir":
            # soccer only: count up or down, keeping the same moment in the current half
            d = 1 if int(a.get("dir", 1)) > 0 else -1
            if s["sport"] == "soccer" and d != c["dir"]:
                running, cur, p = c["running"], self.clock_ms(), s["period"]
                if c["dir"] > 0:
                    new = max(0, self.period_len(p) - (cur - self.period_base(p)))
                else:
                    new = self.period_base(p) + max(0, self.period_len(p) - cur)
                c["dir"] = d
                self.clock_set(new, running=running)
        elif name == "period_next":
            s["period"] += 1
            s["periodText"] = ""
            if s["sport"] == "basketball":
                # team fouls reset every quarter and at the start of each overtime period
                for side in ("home", "away"):
                    T[side]["fouls"] = 0
            self.clock_set(self.period_start_ms(s["period"]), running=False)
        elif name == "period_prev":
            s["period"] = max(1, s["period"] - 1)
            s["periodText"] = ""
        elif name == "timeout_use":
            side = a["side"]
            if side in T:
                T[side]["timeouts"] = max(0, T[side]["timeouts"] - 1)
                self.clock_stop()
        elif name == "set_sport":
            if a["sport"] in SPORTS:
                s["sport"] = a["sport"]
                self.new_game(sport_changed=True)
        elif name == "new_game":
            self.new_game()
        elif name == "swap_teams":
            T["home"], T["away"] = T["away"], T["home"]
            g["sets"]["home"], g["sets"]["away"] = g["sets"]["away"], g["sets"]["home"]
            g["cards"]["home"], g["cards"]["away"] = g["cards"]["away"], g["cards"]["home"]
            g["pens"]["home"], g["pens"]["away"] = g["pens"]["away"], g["pens"]["home"]
        # baseball
        elif name == "reset_count":
            g["balls"] = g["strikes"] = 0
        elif name == "next_half":
            g["balls"] = g["strikes"] = g["outs"] = 0
            g["bases"] = [False, False, False]
            if g["half"] == "top":
                g["half"] = "bot"
            else:
                g["half"] = "top"
                g["inning"] += 1
        elif name == "clear_bases":
            g["bases"] = [False, False, False]
        # volleyball
        elif name == "end_set":
            h, aw = T["home"]["score"], T["away"]["score"]
            g["setScores"].append({"home": h, "away": aw})
            if h > aw:
                g["sets"]["home"] += 1
            elif aw > h:
                g["sets"]["away"] += 1
            for side in ("home", "away"):
                T[side]["score"] = 0
                T[side]["timeouts"] = SPORTS["volleyball"]["toMax"]
            g["possession"] = ""
            s["period"] += 1
        elif name == "undo_set":
            if g["setScores"]:
                last = g["setScores"].pop()
                T["home"]["score"], T["away"]["score"] = last["home"], last["away"]
                if last["home"] > last["away"]:
                    g["sets"]["home"] = max(0, g["sets"]["home"] - 1)
                elif last["away"] > last["home"]:
                    g["sets"]["away"] = max(0, g["sets"]["away"] - 1)
                s["period"] = max(1, s["period"] - 1)
        # soccer penalty shootout
        elif name == "pen_kick":
            side = a.get("side")
            if side in T:
                g["pens"]["active"] = True
                if len(g["pens"][side]) < 30:
                    g["pens"][side].append(1 if a.get("goal") else 0)
        elif name == "pen_undo":
            side = a.get("side")
            if side in T and g["pens"][side]:
                g["pens"][side].pop()
        elif name == "pen_clear":
            g["pens"] = {"active": False, "home": [], "away": []}
        # banner
        elif name == "banner_show":
            b = s["banner"]
            b["text"] = str(a.get("text", ""))[:120]
            b["color"] = str(a.get("color", ""))[:9]
            b["visible"] = bool(b["text"])
            self._cancel_banner_timer()
            secs = float(a.get("autoHide") or 0)
            if secs > 0 and b["visible"]:
                self._banner_timer = self.loop.call_later(secs, self._auto_hide_banner)
        elif name == "banner_hide":
            s["banner"]["visible"] = False
            self._cancel_banner_timer()
        else:
            return False
        return True

    def _cancel_banner_timer(self):
        if self._banner_timer:
            self._banner_timer.cancel()
            self._banner_timer = None

    def _auto_hide_banner(self):
        self._banner_timer = None
        self.state["banner"]["visible"] = False
        asyncio.ensure_future(self.publish())

    # ---- team library ---------------------------------------------------
    TEAM_FIELDS = ("name", "abbr", "record", "color", "color2", "logo", "logoPlate")

    def team_save(self, side):
        t = self.state["teams"].get(side)
        if not t:
            return
        entry = {k: t[k] for k in self.TEAM_FIELDS}
        for existing in self.library:
            if existing["name"].strip().lower() == entry["name"].strip().lower():
                existing.update(entry)
                break
        else:
            entry["id"] = uuid.uuid4().hex[:10]
            self.library.append(entry)
        self.save_library()

    def team_load(self, tid, side):
        t = self.state["teams"].get(side)
        for e in self.library:
            if e["id"] == tid and t:
                for k in self.TEAM_FIELDS:
                    t[k] = e.get(k, t[k])
                return True
        return False

    def team_delete(self, tid):
        self.library = [e for e in self.library if e["id"] != tid]
        self.save_library()

    # ---- serial import --------------------------------------------------
    def on_frame(self, values):  # runs on the event loop
        self.serial_values = values
        if self.state["source"] == "serial" and self.apply_serial_values(values):
            asyncio.ensure_future(self.publish())

    def apply_serial_values(self, values):
        """Apply only the fields whose value changed since the previous frame,
        so a manual edit sticks until the controller changes that field."""
        changed = False
        for name, v in values.items():
            path = SERIAL_PATHS.get(name)
            if not path or self.serial_prev.get(name) == v:
                continue
            self.serial_prev[name] = v
            node = self.state
            for p in path[:-1]:
                node = node[p]
            cur = node[path[-1]]
            new = str(v) if isinstance(cur, str) else v
            if cur != new:
                node[path[-1]] = new
                changed = True
        keys = [k for k in ("clock_minutes", "clock_seconds", "clock_tenths") if k in values]
        if keys and any(self.serial_prev.get(k) != values[k] for k in keys):
            for k in keys:
                self.serial_prev[k] = values[k]
            cur = int(self.clock_ms())
            minutes = values.get("clock_minutes", cur // 60000)
            seconds = values.get("clock_seconds", (cur // 1000) % 60)
            tenths = values.get("clock_tenths", 0 if "clock_seconds" in values else (cur // 100) % 10)
            self.clock_set(minutes * 60000 + seconds * 1000 + tenths * 100, running=False)
            changed = True
        return changed

    def update_serial_config(self, msg):
        ser, proto = msg.get("serial") or {}, msg.get("protocol") or {}
        s = self.cfg["serial"]
        if "port" in ser:
            s["port"] = str(ser["port"] or "")
        for k in ("baud", "bytesize", "stopbits"):
            if ser.get(k) not in (None, ""):
                s[k] = int(ser[k])
        if ser.get("parity") in ("N", "E", "O"):
            s["parity"] = ser["parity"]
        p = self.cfg["protocol"]
        fl = proto.get("frame_length")
        p["frame_length"] = int(fl) if fl not in (None, "") else None
        sm = proto.get("start_marker")
        p["start_marker"] = int(sm) if sm not in (None, "") else None
        valid = {k for k, _ in SERIAL_TARGETS}
        fields = {}
        for name, fc in (proto.get("fields") or {}).items():
            if name not in valid or not isinstance(fc, dict):
                continue
            off = fc.get("offset")
            enc = fc.get("encoding", "raw_int")
            fields[name] = {
                "offset": int(off) if off not in (None, "") else None,
                "length": max(1, int(fc.get("length") or 1)),
                "encoding": enc if enc in ENCODINGS else "raw_int",
            }
        p["fields"] = fields
        self.save_config()
        self.serial_prev.clear()
        self.bridge.configure()

    # ---- websocket ------------------------------------------------------
    async def ws_handler(self, ws, path=None):
        self.clients.add(ws)
        try:
            await ws.send(json.dumps({"type": "state", "t": int(now_ms()), "state": self.state}))
            await ws.send(json.dumps({"type": "library", "teams": self.library}))
            await ws.send(json.dumps(self.serial_payload()))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    await self.handle(msg, ws)
                except Exception as e:
                    print("Bad message:", e)
        finally:
            self.clients.discard(ws)

    async def handle(self, msg, ws):
        t = msg.get("type")
        changed = False
        if t == "set":
            changed = self.set_path(msg["path"], msg["value"])
        elif t == "inc":
            changed = self.inc_path(msg["path"], msg["delta"], msg.get("min"), msg.get("max"))
        elif t == "action":
            changed = self.do_action(msg["name"], msg.get("args") or {})
        elif t == "source":
            if msg.get("value") in ("manual", "serial"):
                self.state["source"] = msg["value"]
                self.serial_prev.clear()
                if msg["value"] == "serial" and self.serial_values:
                    self.apply_serial_values(self.serial_values)
                changed = True
        elif t == "team_save":
            self.team_save(msg["side"])
            await self.send_all({"type": "library", "teams": self.library})
        elif t == "team_load":
            changed = self.team_load(msg["id"], msg["side"])
        elif t == "team_delete":
            self.team_delete(msg["id"])
            await self.send_all({"type": "library", "teams": self.library})
        elif t == "ports":
            ports = []
            if serial is not None:
                ports = sorted(({"device": p.device, "description": p.description or ""}
                                for p in serial.tools.list_ports.comports()),
                               key=lambda x: x["device"])
            await ws.send(json.dumps({"type": "ports", "ports": ports}))
        elif t == "serial_config":
            try:
                self.update_serial_config(msg)
            except Exception as e:
                await ws.send(json.dumps({"type": "error", "message": f"Could not save serial settings: {e}"}))
            await self.send_all(self.serial_payload())
        if changed:
            await self.publish()


# --------------------------------------------------------------------------
# HTTP (static files for the control panel and overlay)
# --------------------------------------------------------------------------
STORE_NAME = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")
STORE_MAX = 16 * 1024 * 1024


def make_handler(web_dir, ws_port, data_dir=None):
    store_dir = os.path.join(data_dir, "stats") if data_dir else None
    if store_dir:
        os.makedirs(store_dir, exist_ok=True)

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                          ".woff2": "font/woff2", ".js": "application/javascript",
                          ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml"}

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=web_dir, **kw)

        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("", "/"):
                self.send_response(302)
                self.send_header("Location", "/control.html")
                self.end_headers()
                return
            if path == "/config.js":
                body = f"window.SCOREBUG={{wsPort:{ws_port}}};".encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/store" or path.startswith("/api/store/"):
                return self._store("GET", path)
            super().do_GET()

        # ---- small JSON document store used by the stat keeper (data/stats/*.json)
        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _store(self, method, path):
            if not store_dir:
                return self._json(404, {"error": "storage disabled"})
            name = path[len("/api/store/"):] if path.startswith("/api/store/") else ""
            if method == "GET" and not name:
                out = {}
                for fn in os.listdir(store_dir):
                    if fn.endswith(".json"):
                        out[fn[:-5]] = int(os.path.getmtime(os.path.join(store_dir, fn)) * 1000)
                return self._json(200, out)
            if not STORE_NAME.match(name):
                return self._json(400, {"error": "bad name"})
            fp = os.path.join(store_dir, name + ".json")
            if method == "GET":
                if not os.path.isfile(fp):
                    return self._json(404, {"error": "not found"})
                with open(fp, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif method == "PUT":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > STORE_MAX:
                    return self._json(413, {"error": "bad size"})
                body = self.rfile.read(n)
                try:
                    json.loads(body)
                except ValueError:
                    return self._json(400, {"error": "not json"})
                tmp = fp + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(body)
                os.replace(tmp, fp)
                self._json(200, {"ok": True})
            elif method == "DELETE":
                if os.path.isfile(fp):
                    os.remove(fp)
                self._json(200, {"ok": True})

        def do_PUT(self):
            path = self.path.split("?")[0]
            if path.startswith("/api/store/"):
                return self._store("PUT", path)
            self._json(404, {"error": "not found"})

        def do_DELETE(self):
            path = self.path.split("?")[0]
            if path.startswith("/api/store/"):
                return self._store("DELETE", path)
            self._json(404, {"error": "not found"})
    return Handler


async def amain(app, args):
    app.loop = asyncio.get_running_loop()
    scfg = app.cfg["server"]
    web_dir = os.path.join(app.base_dir, "web")
    if not os.path.isdir(web_dir):
        raise SystemExit(f"Cannot find the 'web' folder next to the app ({web_dir}).")

    try:
        httpd = ThreadingHTTPServer((scfg["host"], scfg["http_port"]),
                                    make_handler(web_dir, scfg["ws_port"], app.data_dir))
    except OSError as e:
        raise SystemExit(f"Cannot start web server on port {scfg['http_port']}: {e}\n"
                         "Is another copy of Scorebug Studio already running?")
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    try:
        await websockets.serve(app.ws_handler, scfg["host"], scfg["ws_port"], max_size=16 * 1024 * 1024)
    except OSError as e:
        raise SystemExit(f"Cannot start WebSocket server on port {scfg['ws_port']}: {e}")

    app.bridge.configure()
    asyncio.ensure_future(app.clock_watch())
    asyncio.ensure_future(app.saver())

    base = f"http://localhost:{scfg['http_port']}"
    print(f"Scorebug Studio {VERSION}")
    print(f"  Control panel : {base}/control.html")
    print(f"  OBS overlay   : {base}/overlay.html   (Browser Source, 1920 x 1080)")
    if scfg["host"] != "127.0.0.1" and scfg["host"] != "localhost":
        print(f"  Listening on {scfg['host']} - other devices on your network can open the control panel.")
    print("Leave this window open during the broadcast. Press Ctrl+C to quit.")
    if not args.no_browser:
        try:
            webbrowser.open(f"{base}/control.html")
        except Exception:
            pass
    await asyncio.Future()


def main():
    base = app_dir()
    ap = argparse.ArgumentParser(description="Scorebug Studio server")
    ap.add_argument("--config", default=os.path.join(base, "scorebug_config.json"))
    ap.add_argument("--no-browser", action="store_true", help="don't open the control panel automatically")
    ap.add_argument("--reset", action="store_true", help="ignore the saved game state")
    args = ap.parse_args()

    app = App(base, args.config)
    if args.reset:
        app.state = default_state()
    try:
        asyncio.run(amain(app, args))
    except KeyboardInterrupt:
        pass
    except SystemExit as e:
        if e.code and not isinstance(e.code, int):
            print(e.code)
            if getattr(sys, "frozen", False):
                input("Press Enter to exit.")
            sys.exit(1)
        raise
    finally:
        app.save_state()
        app.bridge.stop()


if __name__ == "__main__":
    main()
