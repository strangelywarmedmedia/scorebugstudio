import { action } from "@elgato/streamdeck";
import { scorebug, type Side } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { side?: Side; delta?: string };

/** Add points for a team. Tap = +N, hold = -N (fix a mistake). */
@action({ UUID: "com.scorebugstudio.controller.score" })
export class Score extends ScorebugAction<S> {
	protected override hasHold = true;
	private d(s: S): number { return Number(s.delta) || 1; }
	protected image(s: S): string {
		const side = s.side ?? "home";
		const t = scorebug.state.teams[side];
		return face({ top: t.abbr || t.name, main: `+${this.d(s)}`, bottom: `Score ${t.score}`, bg: t.color, accent: t.color2, size: 64 });
	}
	protected tap(s: S): boolean { return scorebug.inc(`teams.${s.side ?? "home"}.score`, this.d(s), 0); }
	protected override hold(s: S): boolean { return scorebug.inc(`teams.${s.side ?? "home"}.score`, -this.d(s), 0); }
}
