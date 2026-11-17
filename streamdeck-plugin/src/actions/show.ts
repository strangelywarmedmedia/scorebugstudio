import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = Record<string, never>;

/** Show / hide the scorebug on stream. Lit green while it's on air. */
@action({ UUID: "com.scorebugstudio.controller.visibility" })
export class Visibility extends ScorebugAction<S> {
	protected image(): string {
		const v = !!scorebug.state.visible;
		return v ? face({ top: "SCOREBUG", main: "ON AIR", size: 38, bottom: "tap to hide", bg: "#0f6b34", fg: "#ffffff" })
			: face({ top: "SCOREBUG", main: "HIDDEN", size: 38, bottom: "tap to show", bg: "#2a2d36", fg: "#c8ccd6" });
	}
	protected tap(): boolean { return scorebug.set("visible", !scorebug.state.visible); }
}
