import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { CalendarDays } from "lucide-solid";
import { createEffect, createSignal, on, Show } from "solid-js";
import { friendlyError } from "../../lib/errors";
import { orpc } from "../../lib/orpc";
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
	const queryClient = useQueryClient();
	const [title, setTitle] = createSignal("");
	const [date, setDate] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [dateError, setDateError] = createSignal<string | null>(null);
	let picker: HTMLInputElement | undefined;

	createEffect(
		on(
			() => props.open,
			(open) => {
				if (open) {
					setTitle("");
					setDate("");
					setDescription("");
					setDateError(null);
				}
			},
		),
	);

	const add = useMutation(() =>
		orpc.tasks.add.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.dashboard.key() });
				toast({
					title: "Taak aangemaakt",
					description: props.leerlingName
						? `${props.leerlingName} ziet de taak onder Mijn taken.`
						: undefined,
					tone: "success",
				});
				props.onOpenChange(false);
			},
			onError: (error) =>
				toast({ title: "Aanmaken mislukt", description: friendlyError(error), tone: "danger" }),
		}),
	);

	const create = () => {
		const due = parseDutchDate(date());
		if (due === null) {
			setDateError("Vul een datum in als DD/MM/JJJJ, bijvoorbeeld 15/10/2026.");
			return;
		}
		if (!props.leerlingId || !title().trim()) return;
		add.mutate({
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
					<Button disabled={add.isPending || !title().trim()} onClick={create}>
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
							inputMode="numeric"
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
							ref={picker}
							type="date"
							class="sr-only"
							tabIndex={-1}
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
				<button type="submit" class="sr-only" tabIndex={-1}>
					Taak aanmaken
				</button>
			</form>
		</Dialog>
	);
}
