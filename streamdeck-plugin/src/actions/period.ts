import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = Record<string, never>;

/** Period / quarter / half / set. Tap = next (resets the clock), hold = previous. */
@action({ UUID: "com.scorebugstudio.controller.period" })
export class Period extends ScorebugAction<S> {
	protected override hasHold = true;
	protected image(): string {
		const st = scorebug.state;
		const label = st.sport === "football" ? "QTR" : st.sport === "basketball" ? "PERIOD" : st.sport === "baseball" ? "INNING" : st.sport === "soccer" ? "HALF" : "SET";
		const soccer = ["1ST", "2ND", "ET 1", "ET 2"][st.period - 1] ?? "PENS";
		return face({ top: label, main: st.periodText || (st.sport === "soccer" ? soccer : String(st.sport === "baseball" ? st.game.inning : st.period)), bottom: "hold = prev", size: 64 });
	}
	protected tap(): boolean { return scorebug.action("period_next"); }
	protected override hold(): boolean { return scorebug.action("period_prev"); }
}
