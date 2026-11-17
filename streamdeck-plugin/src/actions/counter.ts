import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { field?: string };

type Def = { label: string; get: (st: any) => string; up: (st: any) => boolean; down: (st: any) => boolean; reset: () => boolean };

const num = (path: string, min: number, max: number, dflt = min) => ({
	get: (st: any) => String(path.split(".").reduce((o: any, k) => o?.[k], st) ?? ""),
	up: () => scorebug.inc(path, 1, min, max),
	down: () => scorebug.inc(path, -1, min, max),
	reset: () => scorebug.set(path, dflt)
});

const FIELDS: Record<string, Def> = {
	down: { label: "DOWN", ...num("game.down", 1, 4) },
	// toGo is stored as text ("10", "G"), so it is stepped by hand
	toGo: {
		label: "TO GO",
		get: (st) => String(st.game.toGo ?? ""),
		up: () => scorebug.set("game.toGo", String(Math.min(99, (parseInt(scorebug.state.game.toGo, 10) || 0) + 1))),
		down: () => scorebug.set("game.toGo", String(Math.max(0, (parseInt(scorebug.state.game.toGo, 10) || 0) - 1))),
		reset: () => scorebug.set("game.toGo", "10")
	},
	homeFouls: { label: "HOME FOULS", ...num("teams.home.fouls", 0, 99) },
	awayFouls: { label: "AWAY FOULS", ...num("teams.away.fouls", 0, 99) },
	balls: { label: "BALLS", ...num("game.balls", 0, 3) },
	strikes: { label: "STRIKES", ...num("game.strikes", 0, 2) },
	outs: { label: "OUTS", ...num("game.outs", 0, 2) },
	inning: { label: "INNING", ...num("game.inning", 1, 30) },
	homeSets: { label: "HOME SETS", ...num("game.sets.home", 0, 5) },
	awaySets: { label: "AWAY SETS", ...num("game.sets.away", 0, 5) }
};

/** Generic +1 counter for situation fields (down, distance, fouls, balls/strikes/outs, inning, sets). Hold = -1. */
@action({ UUID: "com.scorebugstudio.controller.counter" })
export class Counter extends ScorebugAction<S> {
	protected override hasHold = true;
	private def(s: S): Def { return FIELDS[s.field ?? "down"] ?? FIELDS.down; }
	protected image(s: S): string {
		const d = this.def(s);
		return face({ top: d.label, main: d.get(scorebug.state), bottom: "tap +1  hold -1", size: 70 });
	}
	protected tap(s: S): boolean { return this.def(s).up(scorebug.state); }
	protected override hold(s: S): boolean { return this.def(s).down(scorebug.state); }
}
