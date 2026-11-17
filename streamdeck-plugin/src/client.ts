import streamDeck from "@elgato/streamdeck";
import WebSocket from "ws";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Side = "home" | "away";

export type GlobalSettings = { host?: string; port?: number };

type Listener = () => void;

/**
 * Single shared connection to the Scorebug Studio server. Holds the latest state,
 * reconnects automatically and tells subscribers when anything changes.
 */
class ScorebugClient {
	state: any = null;
	connected = false;
	/** server clock minus local clock (ms), so the running game clock is right even if clocks differ */
	offset = 0;
	host = "127.0.0.1";
	port = 8765;
	private ws?: WebSocket;
	private timer?: NodeJS.Timeout;
	private backoff = 1000;
	private listeners = new Set<Listener>();
	private started = false;

	onChange(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(): void {
		for (const fn of this.listeners) {
			try { fn(); } catch (e) { streamDeck.logger.error(`listener failed: ${e}`); }
		}
	}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => this.applySettings(ev.settings));
		try { this.applySettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>(), false); } catch { /* defaults */ }
		this.connect();
	}

	private applySettings(s: GlobalSettings, reconnect = true): void {
		const host = (s.host ?? "").trim() || "127.0.0.1";
		const port = Number(s.port) > 0 ? Number(s.port) : 8765;
		const changed = host !== this.host || port !== this.port;
		this.host = host;
		this.port = port;
		if (changed && reconnect) { this.backoff = 1000; this.reconnectNow(); }
	}

	private reconnectNow(): void {
		clearTimeout(this.timer);
		try { this.ws?.removeAllListeners(); this.ws?.terminate(); } catch { /* ignore */ }
		this.ws = undefined;
		this.setConnected(false);
		this.connect();
	}

	private setConnected(v: boolean): void {
		if (this.connected !== v) { this.connected = v; if (!v) this.state = null; this.emit(); }
	}

	private connect(): void {
		const url = `ws://${this.host}:${this.port}`;
		let ws: WebSocket;
		try { ws = new WebSocket(url); } catch (e) { this.retry(); return; }
		this.ws = ws;
		ws.on("open", () => {
			this.backoff = 1000;
			this.setConnected(true);
			this.send({ type: "hello" });
			streamDeck.logger.info(`connected to ${url}`);
		});
		ws.on("message", (data) => {
			let m: any;
			try { m = JSON.parse(data.toString()); } catch { return; }
			if (m.type === "state") {
				this.state = m.state;
				if (typeof m.t === "number") this.offset = m.t - Date.now();
				this.emit();
			}
		});
		ws.on("error", () => { /* close follows */ });
		ws.on("close", () => {
			if (this.ws !== ws) return;
			this.ws = undefined;
			this.setConnected(false);
			this.retry();
		});
	}

	private retry(): void {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.connect(), this.backoff);
		this.backoff = Math.min(this.backoff * 1.5, 8000);
	}

	/** returns false if not connected */
	send(msg: object): boolean {
		if (this.ws?.readyState !== WebSocket.OPEN) return false;
		this.ws.send(JSON.stringify(msg));
		return true;
	}
	set(path: string, value: unknown): boolean { return this.send({ type: "set", path, value }); }
	inc(path: string, delta: number, min?: number, max?: number): boolean {
		return this.send({ type: "inc", path, delta, min, max });
	}
	action(name: string, args: object = {}): boolean { return this.send({ type: "action", name, args }); }

	/** current game clock in ms, extrapolated while running */
	clockMs(): number {
		const c = this.state?.clock;
		if (!c) return 0;
		if (!c.running) return c.ms;
		return Math.max(0, c.ms + c.dir * (Date.now() + this.offset - c.anchor));
	}

	get sport(): string { return this.state?.sport ?? ""; }
}

export const scorebug = new ScorebugClient();
