#!/usr/bin/env python3
"""
capture.py - Raw serial capture tool for reverse-engineering the FairPlay
ProLine data stream.

FairPlay has never published a public byte-level spec for the ProLine
output. The way every known DIY implementation (the 710 board writeup and
the MP-69D decoder project) got a working parser was by watching the raw
bytes change while operating the controller by hand. This tool is built
for that process.

WORKFLOW
--------
1. Set the MP-70/71/72/73 controller's RS-232 port to ProLine mode:
   in sport setup, answer "NO" to "VIDEO CHAR?" (YES is for a video
   character generator, not what we want).
2. Wire the controller's RS-232/GAME OUT port to your computer via the
   USB-to-RS232 adapter. If nothing legible shows up, try a null-modem
   (crossover) cable/adapter -- some Fairplay ports expect DTE, some DCE.
3. Run this script with --scan first to find the right baud rate:
       python3 capture.py --port /dev/ttyUSB0 --scan
   Legible, repeating, fixed-length-looking output = right baud.
   Garbage / constantly-changing-length noise = wrong baud or wrong
   parity/stop bits.
4. Once you've found a baud that looks stable, capture a baseline:
       python3 capture.py --port /dev/ttyUSB0 --baud 9600 --out baseline.log --duration 15
   Don't touch the controller during this capture.
5. Capture again, but this time change ONE thing on the controller
   (e.g. press the home score +1 button once) partway through:
       python3 capture.py --port /dev/ttyUSB0 --baud 9600 --out home_plus1.log --duration 15
6. Diff the two logs (byte-for-byte, same offset within the repeating
   frame). Whichever byte(s) changed value is your home-score field.
   Repeat for guest score, period, clock minutes, clock seconds, etc.
7. Record what you find in scorebug_config.json (see that file's
   comments) and move on to scorebug_server.py.

Run with -h for all options.
"""
import argparse
import datetime
import sys

try:
    import serial
except ImportError:
    sys.exit("Missing dependency. Install with: pip install pyserial")

COMMON_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400]


def hexdump_line(ts, chunk):
    hexpart = " ".join(f"{b:02X}" for b in chunk)
    ascpart = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    return f"[{ts:12.4f}] {hexpart:<48}  {ascpart}"


def run_capture(port, baud, bytesize, parity, stopbits, duration, outfile):
    ser = serial.Serial(
        port=port,
        baudrate=baud,
        bytesize=bytesize,
        parity=parity,
        stopbits=stopbits,
        timeout=0.2,
    )
    print(f"Opened {port} @ {baud} {bytesize}{parity}{stopbits}. Capturing for {duration}s...")
    start = datetime.datetime.now().timestamp()
    fh = open(outfile, "w") if outfile else None
    total_bytes = 0
    try:
        while datetime.datetime.now().timestamp() - start < duration:
            chunk = ser.read(16)
            if chunk:
                ts = datetime.datetime.now().timestamp() - start
                line = hexdump_line(ts, chunk)
                print(line)
                if fh:
                    fh.write(line + "\n")
                total_bytes += len(chunk)
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()
        if fh:
            fh.close()
    rate = total_bytes / duration if duration else 0
    print(f"\nCaptured {total_bytes} bytes in ~{duration}s (~{rate:.0f} B/s).")
    if outfile:
        print(f"Saved to {outfile}")
    if total_bytes == 0:
        print("No data received. Check wiring, try a null-modem adapter, "
              "or confirm the controller is set to ProLine (not VIDEO CHAR) output.")


def run_scan(port, duration_per_baud=3):
    print("Scanning common baud rates. Watch for a legible, repeating pattern.\n")
    for baud in COMMON_BAUDS:
        print(f"--- Trying {baud} baud (8N1) for {duration_per_baud}s ---")
        try:
            run_capture(port, baud, 8, "N", 1, duration_per_baud, None)
        except serial.SerialException as e:
            print(f"  Could not open port: {e}")
            return
        print()
    print("If nothing looked clean, re-run individual bauds with --parity E "
          "or --stopbits 2, or try a null-modem adapter.")


def main():
    ap = argparse.ArgumentParser(description="Capture raw serial data from a FairPlay controller.")
    ap.add_argument("--port", required=True, help="Serial port, e.g. /dev/ttyUSB0 or COM3")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--bytesize", type=int, default=8, choices=[5, 6, 7, 8])
    ap.add_argument("--parity", default="N", choices=["N", "E", "O"])
    ap.add_argument("--stopbits", type=int, default=1, choices=[1, 2])
    ap.add_argument("--duration", type=float, default=15, help="Seconds to capture")
    ap.add_argument("--out", default=None, help="Optional log file to save the hex dump")
    ap.add_argument("--scan", action="store_true", help="Try common baud rates one at a time")
    args = ap.parse_args()

    if args.scan:
        run_scan(args.port)
    else:
        run_capture(args.port, args.baud, args.bytesize, args.parity,
                    args.stopbits, args.duration, args.out)


if __name__ == "__main__":
    main()
