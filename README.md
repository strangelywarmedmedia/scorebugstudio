# scorebugstudio
Scorebug Studio

Broadcast-style scorebugs for OBS with templates for football, basketball, baseball, volleyball and soccer.
Run it manually from a control panel, import the numbers from a FairPlay scoreboard controller, or mix
both - the scoreboard can drive some fields while you control the rest by hand.

 FairPlay controller --(USB-RS232)--> Scorebug Studio server --> overlay.html  --> OBS Browser Source
                                            ^                  \-> control.html (you, in a browser)
                                            +-- manual input ---/
Quick start
Install Python 3 and the two libraries: pip install pyserial websockets
Run python3 scorebug_server.py (Windows: python scorebug_server.py).
The control panel opens in your browser at http://localhost:8000/control.html.
In OBS add a Browser Source:
URL: http://localhost:8000/overlay.html
Width 1920, Height 1080 (any 16:9 size works - the overlay scales itself)
Leave “Shutdown source when not visible” unchecked
Needs OBS 28 or newer.

Prefer a double-clickable app? Run build_mac.sh (on the Mac) or build_windows.bat (on the Windows PC).
Each builds a folder containing the app, web/ and scorebug_config.json. Keep those three together.
First launch: macOS - right-click the app, Open, Open. Windows - SmartScreen, More info, Run anyway
(the app isn’t code-signed).

The control panel

Top bar - pick the sport, choose where data comes from (Manual or Scoreboard), and
SHOW / HIDE the scorebug (it animates on and off). The preview shows exactly what OBS shows.

Switching sport starts a new game: scores and clock reset, but team names, colors and logos are kept.

Live tab - everything you touch during a game.

Football: +6/+3/+2/+1, clock (Space bar starts/stops), period, down & distance, ball-on, possession, timeouts.
Basketball: +1/+2/+3, clock with tenths under 1:00, period, team fouls (a team is in the BONUS once the other team has committed 5 in the quarter; fouls reset automatically at every quarter and at the start of each overtime), possession arrow, timeouts.
Baseball: runs, inning and half, balls/strikes/outs, bases, “Next batter”, “Next half-inning”.
Soccer: goals (+1), cards (yellow/red icons appear under the team), added time (+N next to the clock), halves (Next period = 2nd half, then extra time, then PENS), and a penalty shootout (Goal/Miss per team shows kick dots and the PENS tally). Half length defaults to 40:00 (change it in Style, e.g. 45:00). The clock counts up through the match by default (2nd half starts at 2 x the half length) - flip it any time with Live -> Game clock -> Clock runs: Count UP / Count DOWN (also in Style -> Clock) if your league uses time remaining. Switching mid-game keeps the same moment, just shown the other way (e.g. 12:00 elapsed becomes 28:00 left) and the clock keeps running.
Hide the clock: on football, basketball and soccer, Live -> Game clock -> “Clock is SHOWN... tap to hide” (or Style -> Clock) removes the time from the scorebug and leaves just the period. The clock keeps running behind the scenes. The setting is remembered per sport.
Volleyball: points, serve indicator, timeouts, End set (saves the set score, counts sets won, starts the next set; Undo last set reverses it).
Banner (right side): a message bar under the scorebug - “TOUCHDOWN {T}!”, “FLAG ON THE PLAY”, etc. {T} becomes the chosen team’s name and color; it auto-hides after N seconds.

Teams tab - name, abbreviation, record, main color, score-box color and logo upload for each side
(PNG with transparency is best; it’s resized automatically). Optional white or dark circle behind the logo for
logos that vanish on your team color. Save to saved teams keeps a team in a library so next week you just
click Use as Home / Use as Away. Text color adjusts automatically for readability on any color you pick.

Style tab - starts with the OBS output link and a Copy link button (paste it into an OBS Browser Source). Then, per sport: position (6 anchors), size, nudge X/Y, panel and accent colors, full name vs
abbreviation, home team on left or right. Football/basketball also: period length, timeouts per team, tenths.

Scoreboard data tab - see below.

Everything is saved automatically (data/state.json, data/teams.json) and restored on the next launch.

Importing from the FairPlay scoreboard controller

FairPlay does not publish the byte format of its serial output, so you map it once for your controller:

Connect the controller’s RS-232/data port to the computer (USB-to-RS232 adapter; try a null-modem/crossover
adapter if you see nothing). On MP-70-series controllers the setup menu has a VIDEO CHAR? prompt; answering NO is
reported to give normal scoreboard data rather than video-character-generator output (check your manual).
Scoreboard data tab -> pick the port, try baud rates (9600 is common) until the Raw bytes monitor shows
a steady repeating pattern. (capture.py --scan does the same from the command line.)
Set Frame length to the number of bytes before the pattern repeats; add a Start marker byte if one is
there. The Last frame view then shows each byte with its offset.
Change one thing on the controller (add a home point) and see which byte changed. Type that offset next to
Home score in the table. Pick the encoding: BCD if 21 shows as 21, Binary if 21 shows as 15,
ASCII if the byte looks like a character. The Live column shows what the server decodes - when it
matches the scoreboard, the mapping is right. Repeat for the other fields.
Save & reconnect, then choose Scoreboard in the top bar.

Only mapped fields are imported. A field is applied when the controller changes it, so if you fix a score by hand
it stays fixed until the controller sends a new value for it.

Stream Deck

A separate Elgato Stream Deck plugin (com.scorebugstudio.controller.streamDeckPlugin, Stream Deck 7.1 or newer) controls scores, clock, period, timeouts, banners, counters and base runners. It connects to the same WebSocket port (default 8765), so start Scorebug Studio first. Keys also include:

Period Label - shows HALF, OT or FINAL in place of the quarter on football and basketball. Tap to show it (the key lights up), tap again or move to the next period to clear it.
Soccer Card - a yellow or red card key for each team. Tap adds a card, hold (0.6 s) removes one.
Penalty Shootout - Goal, Miss, Undo and Show keys. Hold Goal or Miss to take the last kick back; on Show, tap shows or hides the shootout and a 1 s hold clears it.

See the plugin’s own README for the full list of actions.

Stat Keeper (all five sports)

Open http://localhost:8000/stats.html (or the “Stat Keeper” link in the control panel). Works on a laptop and
on an iPad/tablet - see “Controlling from a tablet” below for reaching it from another device.

Pick the sport with the sport button at the top (next to “STAT KEEPER”), or in GAME -> This game, or when you start a
new game. You can change it until the first play is recorded; after that, start a new game for a different sport (the old
game stays saved). Each sport has its own template:

Sport	What you record	Box score
Basketball	2PT/3PT/FT made or missed, rebounds, assist, steal, block, turnover, foul, subs	minutes, FG/3P/FT %, rebounds, +/-, team fouls by quarter
Football	pass (pick the receiver, yards, TD), rush (yards, TD), tackles, sacks, TFL, interceptions, breakups, fumbles, FG/XP/2-pt, safety, punts	passing, rushing, receiving, defense, kicking/punting, scoring
Baseball / Softball	hits (with RBI), HR, walk, HBP, strikeout, outs, DP, sacrifices, runs (earned/unearned), SB/CS, errors, pitching changes	batting line, pitching line (IP/H/R/ER/BB/K), runs-hits-errors by inning
Volleyball	kills, attacks, errors, aces, serve errors, assists, digs, blocks, ball-handling/reception errors	points by set, hitting %, aces, blocks, digs
Soccer	goals (with assist), PK goal/miss, own goal, shots, saves, fouls, offsides, corners, yellow/red, subs	minutes, goals/assists, shots, cards; plays are stamped by match minute (45+2')
GAME tab -> Import roster from PDF for each team. Pick a roster PDF that has selectable text (the kind you
save or print from a school/team website); a check screen lists every player so you can fix names/numbers/positions before
saving. No PDF? Paste the roster text instead, or add players by hand. For basketball (5) and soccer (11) tick the
Starters; for baseball tick Start P for the starting pitcher. Save roster for later keeps it in a library
(kept separately for each sport). Scanned/picture PDFs cannot be read - add those by hand.
LIVE tab: tap a player, then tap what happened. Made baskets and goals ask for the assist; football passes, rushes and
punts ask for yards (and TD); baseball hits ask for RBI. Basketball and soccer have SUB. TEAM records
unassigned stats. + Player adds a player by jersey number. UNDO reverses the last play. Football, baseball and
volleyball show the whole roster with a “Jump to #” box. Laptop keys are shown on each button; Z undo, Space clock,
H/J switch team, 1-9 pick an on-court/on-field player.
BOX SCORE tab: line score, team comparison and the box score tables for both teams. Export CSV,
Print / Save as PDF or a JSON backup. PLAY-BY-PLAY tab lists every play; delete any one and all totals recalculate.

Basketball team fouls count per quarter (and per overtime period); a team shows BONUS once the opposing team reaches 5, matching the scorebug.

With Scorebug Studio running on the same sport, the stat keeper shares the game clock and period (football, basketball,
soccer), the inning and half (baseball) or the set number (volleyball), and sends the score to the on-air scorebug - plus team
fouls for basketball and cards for soccer. If the two ever disagree a yellow bar offers “Set scorebug to stats”. If the
scorebug is on another sport, tap the status chip to switch it. Without the scorebug, the stat keeper runs its own clock.
Baseball: when the third out is recorded tap NEXT HALF (the stat keeper does not guess, so you can fix a mistake first).

Data is saved in the browser and on the computer running Scorebug Studio (data/stats/), so clearing the browser
does not lose a game. Use one device at a time to record a game; another device can open the page to watch the box score.
Minutes and plus/minus come from substitutions against the game clock, so keep the clock and periods current.

Controlling from a tablet or second computer

By default only this computer can reach the app. To allow other devices on your network, set
"host": "0.0.0.0" under server in scorebug_config.json, restart, and open
http://<this-computer's-IP>:8000/control.html on the other device. Anyone on that network can then change
your scores, so only do this on a network you trust.

Files
File	Purpose
scorebug_server.py	The server (state, clock, serial import, control + overlay hosting)
web/overlay.html	The OBS overlay (all five sport templates)
web/control.html	The control panel
web/stats.html (+ stats-app.js, stats-engine.js, roster-parse.js, vendor/)	Stat keeper for all five sports; vendor/ is pdf.js (Apache-2.0) for reading roster PDFs offline
web/fonts/	Barlow Condensed (SIL Open Font License), bundled so everything works offline
scorebug_config.json	Serial port, field mapping, ports/host (the Data tab edits this for you)
capture.py	Command-line raw serial capture (optional)
build_mac.sh, build_windows.bat	Build a standalone app
data/	Created at run time: saved game state and saved teams
Troubleshooting
Control panel shows a red dot / nothing updates - the server isn’t running, or another copy is using ports 8000/8765 (change them in the config).
OBS shows nothing - the overlay is hidden (press SHOW), or the Browser Source URL is wrong. Right-click the source -> Refresh.
Serial: “Cannot open ...” - another program (or a second copy of this one) has the port, or the adapter driver isn’t installed.
Serial connected but no frames - set the frame length; check baud rate; try a null-modem adapter.
Start fresh - run with --reset, or delete the data folder.
Scorebug Studio – Stream Deck plugin

Control the Scorebug Studio overlay from an Elgato Stream Deck. Keys show live values (score, clock, timeouts,
possession...) and change colour with your team colours.

Install
Start Scorebug Studio first (it must be running; the plugin talks to its WebSocket port, default 8765).
Double-click com.scorebugstudio.controller.streamDeckPlugin. Stream Deck 7.1 or newer is required.
Drag actions from the Scorebug Studio category onto keys. Pick team/value in the panel below the key preview.
If you changed ws_port (or Scorebug Studio runs on another computer) set it under Connection in any action’s panel.

Keys show OFFLINE while the server is unreachable and reconnect by themselves. Pressing a key while offline flashes the alert.

Actions
Action	Tap	Hold (0.6 s)
Score (home/away, +1/+2/+3/+6)	add points	subtract points
Game Clock (start/stop, start, stop, +/- seconds, reset, show/hide clock on scorebug)	per function	reset (on the time key)
Show / Hide	on air / hide	
Banner (text, color, auto-hide)	show / hide banner	
Period	next (resets clock)	previous
Possession	give / clear	
Timeout	use one (stops clock)	give one back
Counter (down, to-go, fouls, balls, strikes, outs, inning, sets)	+1	-1
Base Runner (1st/2nd/3rd)	toggle	clear all bases
Period Label (HALF, OT or FINAL)	show it in place of the quarter (football, basketball); tap again to go back	
Soccer Card (home/away, yellow/red)	add a card	remove a card
Penalty Shootout (goal, miss, undo, show)	record the kick / undo / show or hide the shootout	on goal/miss: take the last kick back. On show: 1 s hold clears the whole shootout
Game Command	next half-inning, clear count, end set, undo set	New game, swap teams and switch sport need a 1 s hold
