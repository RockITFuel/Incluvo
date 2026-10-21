import { useRouter } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { CalendarDays } from "../../lib/icons";
import { client } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Textarea } from "../ui/text-field";
import { toast } from "../ui/toast";
import { parseDutchDate, toDutchDate, toIsoDate } from "../../lib/dates";

/** Same limits as the server (tasks.add). */
const TITLE_MAX = 64;
const DESCRIPTION_MAX = 1000;

/**
 * "Taak aanmaken" for a leerling (INC-5): titel (max 64), datum (typen als
 * DD/MM/JJJJ of kiezen in de kalender) en toelichting. The leerling sees the
 * task under "Mijn taken" and gets a notification.
 */
export function TaskCreateDialog(props: {
	leerlingId: string | null;
	leerlingName?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	// Writable memos: every time the dialog opens, the form starts empty.
	const [title, setTitle] = createSignal(() => {
		void props.open;
		return "";
	});
	const [date, setDate] = createSignal(() => {
		void props.open;
		return "";
	});
	const [description, setDescription] = createSignal(() => {
		void props.open;
		return "";
	});
	const [dateError, setDateError] = createSignal<string | null>(() => {
		void props.open;
		return null;
	});
	let picker: HTMLInputElement | undefined;

	const add = createAction(
		async (input: { leerlingId: string; title: string; description?: string; dueAt: Date | undefined }) => {
			await client.tasks.add(input);
			toast({
				title: "Taak aangemaakt",
				description: props.leerlingName
					? `${props.leerlingName} ziet de taak onder Mijn taken.`
					: undefined,
				tone: "success",
			});
			props.onOpenChange(false);
			await refresh(router, "tasks");
		},
		{ error: "Aanmaken mislukt" },
	);

	const create = () => {
		const due = parseDutchDate(date());
		if (due === null) {
			setDateError("Vul een datum in als DD/MM/JJJJ, bijvoorbeeld 15/10/2026.");
			return;
		}
		if (!props.leerlingId || !title().trim()) return;
		void add.run({
			leerlingId: props.leerlingId,
			title: title().trim(),
			description: description().trim() || undefined,
			dueAt: due,
		});
	};

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title="Taak aanmaken"
			description={props.leerlingName ? `Voor ${props.leerlingName}` : undefined}
			footer={
				<>
					<Button variant="subtle" onClick={() => props.onOpenChange(false)}>
						Annuleren
					</Button>
					<Button disabled={add.pending() || !title().trim()} onClick={create}>
						Taak aanmaken
					</Button>
				</>
			}
		>
			<form
				class="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					create();
				}}
			>
				<div class="flex flex-col gap-1">
					<Input
						label="Titel"
						required
						maxLength={TITLE_MAX}
						value={title()}
						onInput={(e) => setTitle(e.currentTarget.value)}
					/>
					<span class="self-end text-micro text-muted" aria-live="polite">
						{title().length}/{TITLE_MAX}
					</span>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="task-date" class="text-small font-medium text-ink-2">
						Datum
					</label>
					<div class="flex items-center gap-2">
						<input
							id="task-date"
							class="input flex-1"
							inputmode="numeric"
							placeholder="DD/MM/JJJJ"
							aria-describedby="task-date-hint"
							aria-invalid={dateError() ? "true" : undefined}
							value={date()}
							onInput={(e) => {
								setDate(e.currentTarget.value);
								setDateError(null);
							}}
						/>
						{/* The browser's own calendar, filled back as DD/MM/JJJJ. */}
						<input
							ref={(el) => (picker = el)}
							type="date"
							class="sr-only"
							tabindex={-1}
							aria-hidden="true"
							value={(() => {
								const d = parseDutchDate(date());
								return d ? toIsoDate(d) : "";
							})()}
							onChange={(e) => {
								setDate(toDutchDate(e.currentTarget.value));
								setDateError(null);
							}}
						/>
						<button
							type="button"
							class="icon-btn"
							style={{ width: "42px", height: "42px" }}
							aria-label="Kies een datum in de kalender"
							onClick={() => picker?.showPicker?.()}
						>
							<CalendarDays class="size-4" aria-hidden="true" />
						</button>
					</div>
					<Show
						when={dateError()}
						fallback={
							<span id="task-date-hint" class="text-micro text-muted">
								Bijvoorbeeld 15/10/2026. Leeg laten = geen datum.
							</span>
						}
					>
						<span id="task-date-hint" class="text-micro text-danger" role="alert">
							{dateError()}
						</span>
					</Show>
				</div>

				<div class="flex flex-col gap-1">
					<Textarea
						label="Toelichting"
						maxLength={DESCRIPTION_MAX}
						value={description()}
						onInput={(e) => setDescription(e.currentTarget.value)}
					/>
					<span class="self-end text-micro text-muted" aria-live="polite">
						{description().length}/{DESCRIPTION_MAX}
					</span>
				</div>
				<button type="submit" class="sr-only" tabindex={-1}>
					Taak aanmaken
				</button>
			</form>
		</Dialog>
	);
}
