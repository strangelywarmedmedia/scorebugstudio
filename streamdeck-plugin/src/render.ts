/** Builds 144x144 SVG key faces. Fonts: generic sans so it works on every OS. */
const FONT = "Helvetica Neue, Arial, sans-serif";

export type Face = {
	/** small label on top */
	top?: string;
	/** big middle text */
	main?: string;
	/** small label at bottom */
	bottom?: string;
	/** background color */
	bg?: string;
	/** text color */
	fg?: string;
	/** accent bar color across the top (e.g. team color) */
	accent?: string;
	/** main text size */
	size?: number;
	/** dims the key (disconnected / n/a) */
	dim?: boolean;
	/** small dot top-right, e.g. clock running */
	dot?: string;
};

const esc = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function contrast(hex: string): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
	if (!m) return "#ffffff";
	const n = parseInt(m[1], 16);
	const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	return l > 0.62 ? "#111111" : "#ffffff";
}

/** Main text; a "\n" splits it over two lines (each line a little smaller). */
function mainText(main: string, size: number, framed: boolean): string {
	const lines = main.split("\n").slice(0, 2);
	if (lines.length === 1) return `<text x="72" y="${framed ? 92 : 86}" font-size="${size}" font-weight="800">${esc(main)}</text>`;
	const sz = Math.min(size, 30);
	const y0 = framed ? 78 : 72;
	return lines.map((l, i) => `<text x="72" y="${y0 + i * (sz + 1)}" font-size="${sz}" font-weight="800">${esc(l)}</text>`).join("\n");
}

export function face(f: Face): string {
	const bg = f.bg ?? "#1b1f27";
	const fg = f.fg ?? contrast(bg);
	const op = f.dim ? 0.4 : 1;
	const size = f.size ?? (String(f.main ?? "").length > 5 ? 38 : String(f.main ?? "").length > 3 ? 52 : 70);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" rx="14" fill="${esc(bg)}"/>
${f.accent ? `<rect width="144" height="12" rx="6" fill="${esc(f.accent)}"/><rect y="6" width="144" height="6" fill="${esc(f.accent)}"/>` : ""}
<g opacity="${op}" font-family="${FONT}" fill="${esc(fg)}" text-anchor="middle" font-weight="700">
${f.top ? `<text x="72" y="36" font-size="22" opacity="0.8">${esc(f.top)}</text>` : ""}
${f.main !== undefined ? mainText(String(f.main), size, !!(f.top || f.bottom)) : ""}
${f.bottom ? `<text x="72" y="128" font-size="20" opacity="0.85">${esc(f.bottom)}</text>` : ""}
</g>
${f.dot ? `<circle cx="128" cy="26" r="8" fill="${esc(f.dot)}"/>` : ""}
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export const OFFLINE = face({ top: "SCOREBUG", main: "OFFLINE", size: 28, bottom: "not running", bg: "#2a1517", fg: "#ff8a8a" });

export function fmtClock(ms: number, tenths: boolean): string {
	if (tenths && ms < 60000) {
		const s = Math.floor(ms / 1000);
		return `${s}.${Math.floor((ms % 1000) / 100)}`;
	}
	const total = Math.ceil(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}
