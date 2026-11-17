import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { base?: string };

/** Toggle a runner on first, second or third base. Hold = clear all bases. */
@action({ UUID: "com.scorebugstudio.controller.bases" })
export class Bases extends ScorebugAction<S> {
	protected override hasHold = true;
	private i(s: S): number { return Math.min(2, Math.max(0, Number(s.base ?? 0))); }
	protected image(s: S): string {
		const on = !!scorebug.state.game.bases?.[this.i(s)];
		return face({ top: ["1ST BASE", "2ND BASE", "3RD BASE"][this.i(s)], main: on ? "◆" : "◇", bottom: on ? "RUNNER ON" : "EMPTY", bg: on ? "#8a5a00" : "#1b1f27", size: 70 });
	}
	protected tap(s: S): boolean { return scorebug.set(`game.bases.${this.i(s)}`, !scorebug.state.game.bases?.[this.i(s)]); }
	protected override hold(): boolean { return scorebug.action("clear_bases"); }
}
