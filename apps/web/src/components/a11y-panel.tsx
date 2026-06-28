import { Popover } from "@kobalte/core/popover";
import { Accessibility, X } from "lucide-solid";
import { Show, type JSX } from "solid-js";
import { TRANSLATE_OPTIONS, a11y } from "../lib/a11y/store";
import { SegmentedControl } from "./ui/segmented-control";
import { Select } from "./ui/select";
import { Switch } from "./ui/switch";

function Row(props: {
	label: string;
	hint?: string;
	control: JSX.Element;
}) {
	return (
		<div class="flex items-center justify-between gap-3 border-line-2 border-b py-2.5 last:border-0">
			<div class="min-w-0">
				<div class="text-small font-medium text-ink-2">{props.label}</div>
				<Show when={props.hint}>
					<div class="text-micro text-muted">{props.hint}</div>
				</Show>
			</div>
			{props.control}
		</div>
	);
}

/**
 * Accessibility settings popover, triggered from the topbar.
 * Reads/writes the global `a11y` store, which mirrors onto <html data-*>.
 * Read-aloud + translation are UI stubs for Epic 7 (AI-laag).
 */
export function A11yPanel() {
	const s = a11y.settings;
	return (
		<Popover placement="bottom-end" gutter={8}>
			<Popover.Trigger
				aria-label="Toegankelijkheid"
				class="grid size-9 place-items-center rounded-2 border border-line bg-surface text-ink-2 transition-colors duration-fast hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[expanded]:bg-primary-50 data-[expanded]:text-primary-700"
			>
				<Accessibility class="size-5" />
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content class="z-[90] w-80 max-w-[calc(100vw-1.5rem)] rounded-3 border border-line bg-surface p-5 shadow-3 outline-none animate-scale-in">
					<div class="mb-3 flex items-center justify-between">
						<Popover.Title class="font-head text-h3 text-ink">
							Toegankelijkheid
						</Popover.Title>
						<Popover.CloseButton
							aria-label="Sluiten"
							class="grid size-7 place-items-center rounded-1 text-muted hover:bg-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							<X class="size-4" />
						</Popover.CloseButton>
					</div>

					<Row
						label="Contrast"
						hint="Hoger contrast voor leesbaarheid"
						control={
							<SegmentedControl
								aria-label="Contrast"
								value={s.contrast}
								onChange={(v) => a11y.set("contrast", v)}
								options={[
									{ value: "normal", label: "Normaal" },
									{ value: "high", label: "Hoog" },
								]}
							/>
						}
					/>

					<Row
						label="Lettergrootte"
						hint="Maakt alle tekst groter"
						control={
							<SegmentedControl
								aria-label="Lettergrootte"
								value={s.size}
								onChange={(v) => a11y.set("size", v)}
								options={[
									{ value: "s", label: "S" },
									{ value: "m", label: "M" },
									{ value: "l", label: "L" },
								]}
							/>
						}
					/>

					<Row
						label="Ruimte"
						hint="Hoeveel ruimte tussen onderdelen"
						control={
							<SegmentedControl
								aria-label="Ruimte"
								value={s.density}
								onChange={(v) => a11y.set("density", v)}
								options={[
									{ value: "compact", label: "Compact" },
									{ value: "cozy", label: "Gezellig" },
									{ value: "comfortable", label: "Ruim" },
								]}
							/>
						}
					/>

					<Row
						label="Lettertype"
						hint="Dyslexie-vriendelijk"
						control={
							<SegmentedControl
								aria-label="Lettertype"
								value={s.font}
								onChange={(v) => a11y.set("font", v)}
								options={[
									{ value: "default", label: "Standaard" },
									{ value: "dyslexic", label: "Dyslexie" },
								]}
							/>
						}
					/>

					<Row
						label="Beweging beperken"
						hint="Minder animaties"
						control={
							<Switch
								aria-label="Beweging beperken"
								checked={s.reduceMotion}
								onChange={(v) => a11y.set("reduceMotion", v)}
							/>
						}
					/>

					<Row
						label="Voorlezen"
						hint="Tekst hardop laten lezen (binnenkort)"
						control={
							<Switch
								aria-label="Voorlezen"
								checked={s.readAloud}
								onChange={(v) => a11y.set("readAloud", v)}
							/>
						}
					/>

					<Row
						label="Taal / vertaling"
						hint="AI-vertaling voor leerling & ouders"
						control={
							<Select
								aria-label="Taal"
								value={s.language}
								onChange={(v) => a11y.set("language", v ?? "nl")}
								options={[...TRANSLATE_OPTIONS]}
								triggerClass="w-auto min-w-32"
							/>
						}
					/>
				</Popover.Content>
			</Popover.Portal>
		</Popover>
	);
}
