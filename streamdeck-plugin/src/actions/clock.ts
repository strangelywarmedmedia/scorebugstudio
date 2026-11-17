import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face, fmtClock } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { mode?: string; seconds?: string };

/** Game clock. Modes: toggle (shows the time), start, stop, add/sub seconds, reset, show/hide the clock on the scorebug. Hold on toggle = reset. */
@action({ UUID: "com.scorebugstudio.controller.clock" })
export class Clock extends ScorebugAction<S> {
	protected override ticking = true;
	protected override hasHold = true;
	private secs(s: S): number { return Math.max(1, Number(s.seconds) || 1); }

	protected image(s: S): string {
		const c = scorebug.state.clock;
		const mode = s.mode ?? "toggle";
		switch (mode) {
			case "start": return face({ top: "CLOCK", main: "START", size: 40, bg: "#12351f", fg: "#6df29a" });
			case "stop": return face({ top: "CLOCK", main: "STOP", size: 40, bg: "#3a1616", fg: "#ff7f7f" });
			case "add": return face({ top: "CLOCK", main: `+${this.secs(s)}s`, size: 48 });
			case "sub": return face({ top: "CLOCK", main: `-${this.secs(s)}s`, size: 48 });
			case "reset": return face({ top: "CLOCK", main: "RESET", size: 38, bottom: "hold" });
			case "visible": {
				const shown = scorebug.state.styles?.[scorebug.sport]?.showClock !== false;
				return face({ top: "CLOCK ON AIR", main: shown ? "SHOWN" : "HIDDEN", size: 36, bottom: "tap to " + (shown ? "hide" : "show"), bg: shown ? "#0f6b34" : "#2a2d36" });
			}
			default:
				return face({
					top: `${scorebug.state.periodText || "P" + scorebug.state.period}`,
					main: fmtClock(scorebug.clockMs(), !!c.tenths), size: 44,
					bottom: c.running ? "RUNNING" : "STOPPED",
					bg: c.running ? "#12351f" : "#1b1f27", dot: c.running ? "#4cff8a" : "#ff5d5d"
				});
		}
	}
	protected tap(s: S): boolean {
		switch (s.mode ?? "toggle") {
			case "start": return scorebug.action("clock_start");
			case "stop": return scorebug.action("clock_stop");
			case "add": return scorebug.action("clock_adjust", { delta: this.secs(s) * 1000 });
			case "sub": return scorebug.action("clock_adjust", { delta: -this.secs(s) * 1000 });
			case "reset": return true; // reset needs a hold so it can't happen by accident
			case "visible": {
				const sp = scorebug.sport;
				return scorebug.set(`styles.${sp}.showClock`, scorebug.state.styles?.[sp]?.showClock === false);
			}
			default: return scorebug.action("clock_toggle");
		}
	}
	protected override hold(s: S): boolean {
		const m = s.mode ?? "toggle";
		return m === "toggle" || m === "reset" ? scorebug.action("clock_reset") : this.tap(s);
	}
}
