import { createSignal, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { Languages } from "../../lib/icons";
import { createLoad } from "../../lib/load";
import { client } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { MockBanner } from "./mock-banner";

/**
 * AI-vertaling (#1). Translate any text to a target language so leerlingen (and
 * ouders) who do not yet speak Dutch well can follow along. Open to every
 * authenticated user. Useful both standalone and embedded next to content.
 */

const LANGUAGES = [
	{ value: "nl", label: "Nederlands" },
	{ value: "en", label: "Engels (English)" },
	{ value: "ar", label: "Arabisch (العربية)" },
	{ value: "uk", label: "Oekraïens (українська)" },
	{ value: "tr", label: "Turks (Türkçe)" },
	{ value: "pl", label: "Pools (polski)" },
	{ value: "de", label: "Duits (Deutsch)" },
	{ value: "fr", label: "Frans (français)" },
] as const;

type Lang = (typeof LANGUAGES)[number]["value"];

export function TranslatePanel() {
	const provider = createLoad(
		() => ({}),
		(_, signal) => client.ai.provider(undefined, { signal }),
	);
	const [source, setSource] = createSignal("");
	const [target, setTarget] = createSignal<Lang>("en");
	const [result, setResult] = createSignal<string | null>(null);

	// The error shows inline below the button, not as a toast.
	const translate = createAction(
		async (input: Parameters<typeof client.ai.translate>[0]) => {
			setResult((await client.ai.translate(input)).translated);
		},
		{ onError: () => {} },
	);

	const run = () => {
		const text = source().trim();
		if (!text) return;
		void translate.run({ text, targetLanguage: target() });
	};

	const isArabicTarget = () => target() === "ar";

	return (
		<div class="flex flex-col gap-4">
			<MockBanner mock={provider.data()?.mock} model={provider.data()?.model} />

			<div class="rounded-3 border border-line bg-surface p-5">
				<div class="mb-4 flex items-center gap-3">
					<span
						class="grid size-9 place-items-center rounded-2 bg-primary-50 text-primary-700"
						aria-hidden="true"
					>
						<Languages class="size-5" />
					</span>
					<div>
						<h2 class="font-head text-h3 text-ink">Vertaling</h2>
						<p class="text-micro text-muted">
							Vertaal tekst naar de taal van de leerling of ouder.
						</p>
					</div>
				</div>

				<div class="flex flex-col gap-4">
					<div>
						<label class="mb-1 block text-small font-medium text-ink-2" for="translate-source">
							Tekst
						</label>
						<textarea
							id="translate-source"
							rows={4}
							class="w-full resize-y rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							placeholder="Typ of plak hier de tekst…"
							value={source()}
							onInput={(e) => setSource(e.currentTarget.value)}
						/>
					</div>

					<div class="flex flex-wrap items-end gap-3">
						<Select
							class="min-w-56"
							label="Doeltaal"
							options={[...LANGUAGES]}
							value={target()}
							onChange={(v) => v && setTarget(v as Lang)}
						/>
						<Button onClick={run} disabled={translate.pending() || !source().trim()}>
							{translate.pending() ? "Vertalen…" : "Vertaal"}
						</Button>
					</div>

					<Show when={translate.error()}>
						<p role="alert" class="text-danger text-small">
							Vertalen mislukt. Probeer het opnieuw.
						</p>
					</Show>

					<Show when={result()}>
						<div>
							<p class="mb-1 text-small font-medium text-ink-2">Vertaling</p>
							<p
								class="whitespace-pre-wrap rounded-2 bg-bg p-4 text-body text-ink leading-relaxed"
								lang={target()}
								dir={isArabicTarget() ? "rtl" : "ltr"}
								aria-live="polite"
							>
								{result()}
							</p>
						</div>
					</Show>
				</div>
			</div>
		</div>
	);
}
