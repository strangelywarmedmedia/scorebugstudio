import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { label?: string };

const LABELS: Record<string, { top: string; main: string }> = {
	HALF: { top: "SHOW", main: "HALF" },
	OT: { top: "SHOW", main: "OT" },
	FINAL: { top: "SHOW", main: "FINAL" }
};

/**
 * Replaces the quarter on the scorebug (1ST, 2ND...) with HALF, OT or FINAL, for football and basketball.
 * Tap once to show it (key turns purple), tap again to go back to the normal quarter.
 * Moving to the next period also clears it, so the quarter comes back by itself.
 */
@action({ UUID: "com.scorebugstudio.controller.periodlabel" })
export class PeriodLabel extends ScorebugAction<S> {
	private want(s: S): string { return s.label === "OT" || s.label === "FINAL" ? s.label : "HALF"; }
	protected image(s: S): string {
		const w = this.want(s), l = LABELS[w];
		const on = scorebug.state.periodText === w;
		return face({ top: on ? "ON AIR" : l.top, main: l.main, size: l.main.length > 4 ? 40 : 52, bottom: on ? "tap to clear" : "tap to show",
			bg: on ? "#6a46b4" : "#2a2d36", fg: on ? "#ffffff" : "#d8dbe4" });
	}
	protected tap(s: S): boolean {
		const w = this.want(s);
		return scorebug.set("periodText", scorebug.state.periodText === w ? "" : w);
	}
}
