import { action } from "@elgato/streamdeck";
import { scorebug, type Side } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { side?: Side; card?: string };

/** Soccer yellow / red card for one team. Tap adds a card, hold removes one. */
@action({ UUID: "com.scorebugstudio.controller.card" })
export class Card extends ScorebugAction<S> {
	protected override hasHold = true;
	private path(s: S): string { return `game.cards.${s.side ?? "home"}.${s.card === "red" ? "red" : "yellow"}`; }
	protected image(s: S): string {
		const st = scorebug.state, side = s.side ?? "home", red = s.card === "red";
		const t = st.teams[side];
		const n = Number(st.game?.cards?.[side]?.[red ? "red" : "yellow"] ?? 0);
		const soccer = st.sport === "soccer";
		return face({
			top: `${t.abbr || t.name} ${red ? "RED" : "YEL"}`, main: soccer ? String(n) : "-", size: 72,
			bottom: soccer ? "tap +1  hold -1" : "soccer only",
			bg: red ? "#c1121f" : "#f2c200", fg: red ? "#ffffff" : "#111111", dim: !soccer
		});
	}
	protected tap(s: S): boolean { return scorebug.inc(this.path(s), 1, 0, 9); }
	protected override hold(s: S): boolean { return scorebug.inc(this.path(s), -1, 0, 9); }
}
