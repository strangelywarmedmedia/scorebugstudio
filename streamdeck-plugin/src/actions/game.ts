import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction, LONG_HOLD_MS } from "./base.js";

type S = { command?: string; sport?: string };

const SAFE: Record<string, { label: string; sub: string; name: string }> = {
	next_half: { label: "NEXT", sub: "HALF-INNING", name: "next_half" },
	reset_count: { label: "CLEAR", sub: "BALLS/STRIKES", name: "reset_count" },
	end_set: { label: "END", sub: "SET", name: "end_set" },
	undo_set: { label: "UNDO", sub: "LAST SET", name: "undo_set" }
};
const RISKY: Record<string, { label: string; sub: string }> = {
	new_game: { label: "NEW GAME", sub: "hold 1s" },
	swap_teams: { label: "SWAP TEAMS", sub: "hold 1s" },
	set_sport: { label: "SPORT", sub: "hold 1s" }
};

/**
 * Game commands. Things that wipe or flip the game (new game, swap teams, change sport)
 * only fire after holding the key for a full second so they can't happen by accident.
 */
@action({ UUID: "com.scorebugstudio.controller.game" })
export class Game extends ScorebugAction<S> {
	protected override hasHold = true;
	protected image(s: S): string {
		const c = s.command ?? "next_half";
		if (SAFE[c]) return face({ top: SAFE[c].label, main: SAFE[c].sub, size: SAFE[c].sub.length > 8 ? 20 : 32, bg: "#1b1f27" });
		const r = RISKY[c] ?? RISKY.new_game;
		const sub = c === "set_sport" ? (s.sport ?? "football").toUpperCase() : r.label;
		return face({ top: c === "set_sport" ? "SWITCH TO" : "⚠ " + r.sub, main: sub, size: sub.length > 8 ? 20 : sub.length > 6 ? 24 : 30, bg: "#3a2410", fg: "#ffcf8a" });
	}
	protected tap(s: S): boolean | Promise<boolean> {
		const c = s.command ?? "next_half";
		return SAFE[c] ? scorebug.action(SAFE[c].name) : true; // risky commands ignore taps
	}
	protected override hold(s: S, ms: number): boolean {
		const c = s.command ?? "next_half";
		if (SAFE[c]) return scorebug.action(SAFE[c].name);
		if (ms < LONG_HOLD_MS) return true;
		if (c === "set_sport") return scorebug.action("set_sport", { sport: s.sport ?? "football" });
		return scorebug.action(c);
	}
}
