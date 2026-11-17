# Scorebug Studio – Stream Deck plugin

Control the Scorebug Studio overlay from an Elgato Stream Deck. Keys show live values (score, clock, timeouts,
possession...) and change colour with your team colours.

## Install
1. Start Scorebug Studio first (it must be running; the plugin talks to its WebSocket port, default **8765**).
2. Double-click `com.scorebugstudio.controller.streamDeckPlugin`. Stream Deck 7.1 or newer is required.
3. Drag actions from the **Scorebug Studio** category onto keys. Pick team/value in the panel below the key preview.
4. If you changed `ws_port` (or Scorebug Studio runs on another computer) set it under **Connection** in any action's panel. If Scorebug Studio is on another computer, turn on **Style -> Other devices -> Allow other devices** there first.

Keys show **OFFLINE** while the server is unreachable and reconnect by themselves. Pressing a key while offline flashes the alert.

## Actions
| Action | Tap | Hold (0.6 s) |
|---|---|---|
| Score (home/away, +1/+2/+3/+6) | add points | subtract points |
| Game Clock (start/stop, start, stop, +/- seconds, reset, show/hide clock on scorebug) | per function | reset (on the time key) |
| Show / Hide | on air / hide | |
| Banner (ready-made or custom message, color, auto-hide) | show the banner; tap again to hide | |
| Period | next (resets clock) | previous |
| Possession | give / clear | |
| Timeout | use one (stops clock) | give one back |
| Counter (down, to-go, fouls, balls, strikes, outs, inning, sets) | +1 | -1 |
| Base Runner (1st/2nd/3rd) | toggle | clear all bases |
| Period Label (HALF, OT or FINAL) | show it in place of the quarter (football, basketball); tap again to go back | |
| Soccer Card (home/away, yellow/red) | add a card | remove a card |
| Penalty Shootout (goal, miss, undo, show) | record the kick / undo / show or hide the shootout | on goal/miss: take the last kick back. On show: **1 s hold** clears the whole shootout |
| Game Command | next half-inning, clear count, end set, undo set | New game, swap teams and switch sport need a **1 s hold** |

## Banners
Add a **Banner** key for each message you use. In the key's panel:
- **Message** - pick a ready-made banner (Touchdown, Three pointer, Home run, Goal, Yellow card, Final, and more) or **Custom text...**. `{T}` in a message becomes the team name chosen under Banner color, so "TOUCHDOWN {T}!" shows "TOUCHDOWN West Lincoln!".
- **Banner color** - **Generic** uses the scorebug's accent color (and leaves out the team name), **Home team color** and **Away team color** use the colors set on Scorebug Studio's Teams tab at the moment you tap, or pick a **Custom color**.
- **Auto-hide** - seconds before the banner goes away on its own (0 = stays until you tap the key again).

The key shows its color along the top, HOME or AWAY along the bottom, and turns amber with "tap to hide" while its banner is on the air. Keys made with an earlier version keep working unchanged.

## Build from source
`npm install`, `npm run build`, then `npx streamdeck pack com.scorebugstudio.controller.sdPlugin`.
Needs Node 20+; Stream Deck runs the plugin on its own bundled Node 24.
