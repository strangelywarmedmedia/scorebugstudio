import { action } from "@elgato/streamdeck";
import { scorebug, type Side } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { side?: Side };

/** Possession / serve indicator (football ball, basketball arrow, volleyball serve). Tap again to clear. */
@action({ UUID: "com.scorebugstudio.controller.possession" })
export class Possession extends ScorebugAction<S> {
	protected image(s: S): string {
		const side = s.side ?? "home";
		const t = scorebug.state.teams[side];
		const has = scorebug.state.game.possession === side;
		return face({ top: t.abbr || t.name, main: has ? "●" : "○", bottom: has ? "HAS BALL" : "POSSESSION", bg: has ? t.color : "#1b1f27", accent: t.color, size: 64 });
	}
	protected tap(s: S): boolean {
		const side = s.side ?? "home";
		return scorebug.set("game.possession", scorebug.state.game.possession === side ? "" : side);
	}
}
