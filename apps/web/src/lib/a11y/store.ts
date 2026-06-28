import { makePersisted } from "@solid-primitives/storage";
import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";

/**
 * Global accessibility preferences for Incluvo.
 *
 * The store is the single source of truth. A reactive effect mirrors every
 * setting onto `data-*` attributes on the <html> element; src/app.css reads
 * those attributes and flips the relevant CSS variables, so the whole UI
 * (and every component built on the tokens) responds automatically.
 *
 * Settings are persisted to localStorage via @solid-primitives/storage so a
 * leerling keeps their preferences between visits.
 *
 * Read-aloud and translation are part of later epics (AI-laag, Epic 7); they
 * are kept in the model + UI as stubs so feature agents can wire them up.
 */

export type Contrast = "normal" | "high";
export type FontSize = "s" | "m" | "l";
export type Density = "compact" | "cozy" | "comfortable";
export type FontFamily = "default" | "dyslexic";

export type A11ySettings = {
	contrast: Contrast;
	size: FontSize;
	density: Density;
	font: FontFamily;
	reduceMotion: boolean;
	/** TODO(Epic 7 — AI-laag): wire up text-to-speech read-aloud. */
	readAloud: boolean;
	/** TODO(Epic 7 — AI-laag): AI translation for leerling & ouders. */
	language: string;
};

const DEFAULTS: A11ySettings = {
	contrast: "normal",
	size: "m",
	density: "cozy",
	font: "default",
	reduceMotion: false,
	readAloud: false,
	language: "nl",
};

export const TRANSLATE_OPTIONS = [
	{ value: "nl", label: "Nederlands" },
	{ value: "en", label: "English" },
	{ value: "ar", label: "العربية" },
	{ value: "tr", label: "Türkçe" },
	{ value: "uk", label: "Українська" },
	{ value: "pl", label: "Polski" },
] as const;

function createA11yStore() {
	const [settings, setSettings] = makePersisted(
		createStore<A11ySettings>({ ...DEFAULTS }),
		{ name: "incluvo:a11y" },
	);

	// Reflect settings onto <html data-*> so CSS variables react.
	createEffect(() => {
		if (typeof document === "undefined") return;
		const el = document.documentElement;
		el.dataset.contrast = settings.contrast;
		el.dataset.size = settings.size;
		el.dataset.density = settings.density;
		el.dataset.font = settings.font;
		el.dataset.reduceMotion = String(settings.reduceMotion);
		el.lang = settings.language;
	});

	return {
		settings,
		set: <K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) =>
			setSettings(key, value),
		reset: () => setSettings({ ...DEFAULTS }),
	};
}

/**
 * Singleton store. Created inside createRoot so the reactive effect lives for
 * the lifetime of the app rather than being tied to a component scope.
 */
export const a11y = createRoot(createA11yStore);
