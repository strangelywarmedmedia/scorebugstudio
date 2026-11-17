import { action } from "@elgato/streamdeck";
import { scorebug } from "../client.js";
import { face } from "../render.js";
import { ScorebugAction } from "./base.js";

type S = { preset?: string; text?: string; label?: string; colorMode?: string; color?: string; autoHide?: string };

const HEX = /^#[0-9a-f]{6}$/i;

/** What this key would send right now: message text (with {T} filled in) and the banner colour ("" = scorebug accent). */
function resolve(s: S): { text: string; color: string; team: string } {
	const st = scorebug.state;
	// Keys made before presets existed only have text + color
	const raw = (s.preset && s.preset !== "custom" ? s.preset : s.text) ?? "";
	const mode = s.colorMode ?? (s.color ? "custom" : "accent");
	const t = mode === "home" || mode === "away" ? st.teams[mode] : undefined;
	const teamName = t?.name ?? "";
	const text = raw
		.replace(/\{T\}/g, teamName)
		.replace(/\{HOME\}/gi, st.teams.home.name)
		.replace(/\{AWAY\}/gi, st.teams.away.name)
		.replace(/\s+([!?.,:])/g, "$1")
		.replace(/\s{2,}/g, " ")
		.trim();
	const color = t ? t.color : mode === "custom" && s.color && HEX.test(s.color) ? s.color : "";
	return { text, color, team: mode === "home" || mode === "away" ? mode.toUpperCase() : "" };
}

/** Short key label from the message: drops {T} and punctuation, splits long ones over two lines. */
function autoLabel(raw: string): string {
	const words = raw.replace(/\{[A-Z]+\}/gi, " ").replace(/[!?.,:]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
	if (!words.length) return "BANNER";
	const one = words.join(" ");
	if (one.length <= 8 || words.length === 1) return one;
	let best = 1, diff = 99;
	for (let i = 1; i < words.length; i++) {
		const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
		if (d < diff) { diff = d; best = i; }
	}
	return words.slice(0, best).join(" ") + "\n" + words.slice(best).join(" ");
}

/** Pop a message banner under the scorebug ("TOUCHDOWN {T}!", "THREE POINTER!"). Tap again to take it down. */
@action({ UUID: "com.scorebugstudio.controller.banner" })
export class Banner extends ScorebugAction<S> {
	protected image(s: S): string {
		const b = scorebug.state.banner;
		const r = resolve(s);
		const showing = !!(b?.visible && r.text && b.text === r.text);
		const raw = (s.preset && s.preset !== "custom" ? s.preset : s.text) ?? "";
		const label = (s.label ? s.label.slice(0, 14) : autoLabel(raw));
		const longest = Math.max(...label.split("\n").map((l) => l.length));
		const accent = r.color || scorebug.state.styles?.[scorebug.state.sport]?.accent || "#ffc20e";
		return face({ top: "BANNER", main: label, size: Math.max(14, Math.min(32, Math.floor(122 / (longest * 0.72)))), accent,
			bottom: showing ? "tap to hide" : r.team,
			bg: showing ? "#7a5200" : "#1b1f27", dot: showing ? "#ffd24a" : undefined });
	}
	protected tap(s: S): boolean {
		const b = scorebug.state.banner;
		const r = resolve(s);
		if (b?.visible && r.text && b.text === r.text) return scorebug.action("banner_hide");
		if (!r.text) return false;
		return scorebug.action("banner_show", { text: r.text, color: r.color, autoHide: s.autoHide === "" ? 0 : Number(s.autoHide ?? 6) });
	}
}
