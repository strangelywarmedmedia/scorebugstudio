import { action } from "@elgato/streamdeck";
import { scorebug, type Side } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction, LONG_HOLD_MS } from "./base.js";

type S = { side?: Side; kick?: string };

const tally = (arr: number[] | undefined): { goals: number; kicks: number } => {
	const a = arr ?? [];
	return { goals: a.reduce((n, v) => n + (v ? 1 : 0), 0), kicks: a.length };
};

/**
 * Soccer penalty shootout. Per team: GOAL and MISS record a kick, UNDO takes the last kick back.
 * SHOW puts the shootout tally on the scorebug (tap) and clears the whole shootout (hold 1 s).
 */
@action({ UUID: "com.scorebugstudio.controller.shootout" })
export class Shootout extends ScorebugAction<S> {
	protected override hasHold = true;
	private mode(s: S): string { return s.kick ?? "goal"; }
	protected image(s: S): string {
		const st = scorebug.state, side = s.side ?? "home", t = st.teams[side];
		const pens = st.game?.pens ?? { active: false, home: [], away: [] };
		const h = tally(pens.home), a = tally(pens.away), mine = side === "home" ? h : a;
		const soccer = st.sport === "soccer";
		const score = `${h.goals}-${a.goals}`;
		const m = this.mode(s);
		const dim = !soccer;
		switch (m) {
			case "miss": return face({ top: `${t.abbr || t.name} PK`, main: "MISS", size: 46, bottom: `${mine.goals}/${mine.kicks} scored`, bg: "#5a1d22", fg: "#ff9a9a", dim });
			case "undo": return face({ top: `${t.abbr || t.name} PK`, main: "UNDO", size: 44, bottom: "last kick", bg: "#2a2d36", dim });
			case "show": return face({ top: "SHOOTOUT", main: score, size: 52, bottom: pens.active ? "ON AIR - hold clears" : "tap to show", bg: pens.active ? "#0f6b34" : "#2a2d36", dim });
			default: return face({ top: `${t.abbr || t.name} PK`, main: "GOAL", size: 46, bottom: `${mine.goals}/${mine.kicks} scored`, bg: "#14501f", fg: "#8ff0b0", dim });
		}
	}
	private kick(s: S, goal: boolean): boolean { return scorebug.action("pen_kick", { side: s.side ?? "home", goal }); }
	protected tap(s: S): boolean {
		switch (this.mode(s)) {
			case "miss": return this.kick(s, false);
			case "undo": return scorebug.action("pen_undo", { side: s.side ?? "home" });
			case "show": return scorebug.set("game.pens.active", !scorebug.state.game?.pens?.active);
			default: return this.kick(s, true);
		}
	}
	protected override hold(s: S, ms: number): boolean {
		const m = this.mode(s);
		if (m === "show") return ms >= LONG_HOLD_MS ? scorebug.action("pen_clear") : true;
		if (m === "goal" || m === "miss") return scorebug.action("pen_undo", { side: s.side ?? "home" }); // hold = take the last kick back
		return this.tap(s);
	}
}
