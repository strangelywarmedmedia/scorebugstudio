# Changelog - Scorebug Studio

All notable changes to the app. Newest first. Version numbers: the middle number goes up for new features, the last for fixes.
The Stream Deck plugin has its own version and changelog (see `CHANGELOG-streamdeck.md`).

## 2.2.1 - 2026-11-18
### Added
- **Info row size** slider (Style tab, per sport): makes the timeouts, fouls, bonus, sets and card row under the scorebug larger (up to 150%) or smaller. Default is unchanged.

## 2.2.0 - 2026-11-17
### Added
- **Basketball Quick mode** in the Stat Keeper (on by default; untick in GAME -> Rules & options): whole roster on screen, nine big buttons (2PT, 3PT, FT, REB, AST, STL, BLK, TO, FOUL), no subs, minutes or misses.
- **Assist strip**: a made basket is recorded instantly; tap the passer's number within a few seconds to credit the assist (or ignore it). It no longer blocks the screen.
- **Next-period prompt**: when the clock hits 0:00 the next-period button lights up (for example NEXT Q2).
- **Score corrections**: when the scorebug score is changed outside the Stat Keeper, the stats follow automatically ("Score corrected to match scorebug" in the play-by-play). Option "Keep the stats score equal to the scorebug".
### Fixed
- Stats and scorebug scores drifting apart. Plays recorded while the scorebug was disconnected are now sent when it reconnects, and score changes made on the scorebug are no longer ignored by the stats.
- The mismatch bar now offers both directions: "Use scorebug score" and "Set scorebug to stats".

## 2.1.0 - 2026-11-16
### Added
- **Other devices** switch in the Style tab: one button lets an iPad, phone or second computer use the Stat Keeper or control panel, with the address and a QR code to scan. No config-file editing or restart needed. Other devices are blocked until it is on, and turning it off disconnects them.
- **Stat Keeper for all five sports** (basketball, football, baseball/softball, volleyball, soccer), each with its own stat buttons, box score and play-by-play. Pick the sport at the top of the Stat Keeper. Rosters are kept separately for each sport.
- **OBS output link** with a Copy button at the top of the Style tab.
- Soccer: Count UP / Count DOWN clock toggle (Live tab and Style tab).
- Quick banners "Three pointer" and "Dunk" for basketball.
### Changed
- Basketball team fouls reset every quarter and at the start of each overtime period.
- Roster PDF import recognizes football, baseball, soccer and volleyball positions.
### Fixed
- Basketball bonus: BONUS now shows on the team that benefits (once the *other* team has 5 fouls in the quarter), in the scorebug, the control panel hint and the Stat Keeper.

## 2.0.0
- Scorebug templates for football, basketball, baseball, volleyball and soccer.
- Control panel (Live, Teams, Style, Scoreboard data), manual or FairPlay scoreboard input, banners, saved teams and logos.
- Stat Keeper for basketball.
- Stream Deck plugin support over the WebSocket port.
