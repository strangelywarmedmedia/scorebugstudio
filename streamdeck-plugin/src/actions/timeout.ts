import { action } from "@elgato/streamdeck";
import { scorebug, type Side } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { side?: Side };

/** Use a timeout (stops the clock). Hold to give one back. */
@action({ UUID: "com.scorebugstudio.controller.timeout" })
export class Timeout extends ScorebugAction<S> {
	protected override hasHold = true;
	protected image(s: S): string {
		const t = scorebug.state.teams[s.side ?? "home"];
		return face({ top: t.abbr || t.name, main: String(t.timeouts), bottom: "TIMEOUTS", bg: t.color, accent: t.color2, size: 70, dim: t.timeouts === 0 });
	}
	protected tap(s: S): boolean { return scorebug.action("timeout_use", { side: s.side ?? "home" }); }
	protected override hold(s: S): boolean { return scorebug.inc(`teams.${s.side ?? "home"}.timeouts`, 1, 0, 9); }
}
