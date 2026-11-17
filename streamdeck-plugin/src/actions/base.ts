import { KeyUpEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { scorebug } from "../client.js";
import { OFFLINE } from "../render.js";

export const HOLD_MS = 600;
export const LONG_HOLD_MS = 1000;

type Entry<T extends JsonObject> = { action: KeyAction<T>; settings: T; last?: string; down?: number };

/**
 * Shared behaviour: tracks visible keys, redraws them when the scorebug state changes,
 * and gives each action a tap / hold distinction (decided on key release).
 */
export abstract class ScorebugAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
	protected keys = new Map<string, Entry<T>>();
	/** set true on actions that show a running clock so they redraw 4x/second */
	protected ticking = false;
	private static unsub?: () => void;
	private static instances = new Set<ScorebugAction<any>>();

	constructor() {
		super();
		ScorebugAction.instances.add(this);
		if (!ScorebugAction.unsub) {
			ScorebugAction.unsub = scorebug.onChange(() => ScorebugAction.instances.forEach((i) => i.renderAll()));
			setInterval(() => ScorebugAction.instances.forEach((i) => i.ticking && i.renderAll()), 250);
		}
	}

	/** image (data URL) for the key given its settings */
	protected abstract image(settings: T): string;
	/** tap (< HOLD_MS) */
	protected abstract tap(settings: T): boolean | void | Promise<boolean | void>;
	/** hold; return undefined if this action has no hold behaviour. Duration passed so actions can use two tiers. */
	protected hold(_settings: T, _ms: number): boolean | void | Promise<boolean | void> { return undefined; }
	protected hasHold = false;

	protected renderAll(): void {
		for (const e of this.keys.values()) void this.draw(e);
	}

	private async draw(e: Entry<T>): Promise<void> {
		let img: string;
		try { img = scorebug.connected && scorebug.state ? this.image(e.settings) : OFFLINE; }
		catch { img = OFFLINE; }
		if (img === e.last) return;
		e.last = img;
		try { await e.action.setImage(img); } catch { /* key vanished */ }
	}

	override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
		await scorebug.start();
		if (!ev.action.isKey()) return;
		const e: Entry<T> = { action: ev.action, settings: ev.payload.settings };
		this.keys.set(ev.action.id, e);
		await this.draw(e);
	}

	override onWillDisappear(ev: WillDisappearEvent<T>): void {
		this.keys.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
		const e = this.keys.get(ev.action.id);
		if (e) { e.settings = ev.payload.settings; e.last = undefined; await this.draw(e); }
	}

	override onKeyDown(ev: KeyDownEvent<T>): void {
		const e = this.keys.get(ev.action.id);
		if (e) e.down = Date.now();
	}

	override async onKeyUp(ev: KeyUpEvent<T>): Promise<void> {
		const e = this.keys.get(ev.action.id);
		if (!e) return;
		const ms = e.down ? Date.now() - e.down : 0;
		e.down = undefined;
		let ok: boolean | void;
		if (this.hasHold && ms >= HOLD_MS) ok = await this.hold(e.settings, ms);
		else ok = await this.tap(e.settings);
		if (ok === false) await ev.action.showAlert();
	}
}
