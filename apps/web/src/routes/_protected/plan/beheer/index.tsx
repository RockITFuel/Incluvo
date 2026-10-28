import { createFileRoute, useNavigate, useRouter } from "@tanstack/solid-router";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { FormPreview, type PreviewQuestion } from "../../../../components/coachplan/form-preview";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { RouteDataView } from "../../../../components/ui/route-data-view";
import { Select } from "../../../../components/ui/select";
import { Switch } from "../../../../components/ui/switch";
import { Input } from "../../../../components/ui/text-field";
import { toast } from "../../../../components/ui/toast";
import { createAction } from "../../../../lib/action";
import { createAnswerSaver } from "../../../../lib/coachplan/answer-saver";
import { friendlyError } from "../../../../lib/errors";
import { ChevronDown, ChevronUp, Eye, Trash2 } from "../../../../lib/icons";
import { requireRole } from "../../../../lib/auth/role-guard";
import { useMe } from "../../../../lib/auth/use-me";
import { cn } from "../../../../lib/cn";
import { client, type Output } from "../../../../lib/orpc";
import { refresh } from "../../../../lib/refresh";
import { loadRouteData } from "../../../../lib/route-data";

/**
 * Formulierenmanager (#8/#9/#10) — keyuser+. Lists templates (Ondivera + own
 * school, newest version of each), lets you copy an Ondivera template into the
 * school (#9), create a new one, edit its questions with a per-question-type
 * editor, and set the school default (#10). Versions (D5): a form in use is
 * read-only — "Nieuwe versie maken" starts an editable next version — and a
 * school copy shows when its Ondivera source has a newer version to upgrade to.
 *
 * The selected template lives in the URL (`?template=`), so the loader fetches
 * its questions and a reload or shared link opens the same form.
 */
export const Route = createFileRoute("/_protected/plan/beheer/")({
	validateSearch: (search: Record<string, unknown>): { template?: string } => ({
		template: typeof search.template === "string" ? search.template : undefined,
	}),
	loaderDeps: ({ search }) => ({ template: search.template }),
	beforeLoad: ({ context }) => requireRole(context.me, { min: "keyuser" }),
	loader: async ({ deps, abortController }) => {
		const signal = abortController.signal;
		const [templates, detail] = await Promise.all([
			loadRouteData(signal, (s) => client.coachplan.templates.list(undefined, { signal: s })),
			deps.template
				? loadRouteData(signal, (s) =>
						client.coachplan.templates.get({ id: deps.template! }, { signal: s }),
					)
				: null,
		]);
		return { templates, detail };
	},
	component: FormManager,
});

type TemplateDetail = Output<typeof client.coachplan.templates.get>;
type QuestionRow = TemplateDetail["questions"][number];

// INC-29: one "Meerkeuze" type; its variant picks single or multiple choice.
const QUESTION_TYPES = [
	{ value: "short_text", label: "Korte tekst" },
	{ value: "long_text", label: "Lange tekst" },
	{ value: "choice", label: "Meerkeuze" },
	{ value: "scale", label: "Schaal" },
	{ value: "boolean", label: "Ja / nee" },
	{ value: "smiley", label: "Smileys" },
	{ value: "leervoorkeur", label: "Leervoorkeur (trigger)" },
];

const CHOICE_TYPES: readonly string[] = ["single_choice", "multiple_choice"];

const CHOICE_VARIANTS = [
	{ value: "single", label: "Eén optie mogelijk" },
	{ value: "multiple", label: "Meerdere opties mogelijk" },
	{ value: "multiple_other", label: "Meerdere opties en vrij veld" },
];

const SECTIONS = [
	{ value: "leerling", label: "Leerling" },
	{ value: "coach", label: "Coach" },
];

function FormManager() {
	const me = useMe();
	const router = useRouter();
	const navigate = useNavigate({ from: Route.fullPath });
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const selectedId = () => search().template ?? null;
	const select = (id: string | null) =>
		navigate({ search: { template: id ?? undefined } });

	const reload = () => refresh(router, "coachplan");

	const [newName, setNewName] = createSignal("");
	const createTemplate = createAction(
		async () => {
			const name = newName().trim();
			if (!name) return;
			const tpl = await client.coachplan.templates.create({ name });
			setNewName("");
			toast({ title: "Template aangemaakt", tone: "success" });
			await select(tpl.id);
			await reload();
		},
		{ error: "Aanmaken lukte niet" },
	);

	const copyTemplate = createAction(
		async (id: string) => {
			const tpl = await client.coachplan.templates.copyToSchool({ id });
			toast({ title: "Gekopieerd naar je school", tone: "success" });
			await select(tpl.id);
			await reload();
		},
		{ error: "Kopiëren lukte niet" },
	);

	const setDefault = createAction(
		async (id: string) => {
			await client.coachplan.templates.setSchoolDefault({ templateId: id });
			toast({ title: "Standaardformulier ingesteld", tone: "success" });
			await reload();
		},
		{ error: "Instellen lukte niet" },
	);

	const makeNewVersion = createAction(
		async (id: string) => {
			if (!(await questionSaver.flush())) return;
			const tpl = await client.coachplan.templates.newVersion({ id });
			toast({
				title: `Concept versie ${tpl.version} gemaakt`,
				description: "Pas de vragen aan en publiceer het concept daarna.",
				tone: "success",
			});
			await select(tpl.id);
			await reload();
		},
		{ error: "Lukte niet" },
	);

	// INC-7: a concept becomes usable (and frozen) once published.
	const publish = createAction(
		async (id: string) => {
			if (!(await questionSaver.flush())) return;
			const tpl = await client.coachplan.templates.publish({ id });
			toast({
				title: `Versie ${tpl.version} gepubliceerd`,
				description: "Ingevulde plannen blijven op hun eigen versie.",
				tone: "success",
			});
			await reload();
		},
		{ error: "Publiceren lukte niet" },
	);

	const discard = createAction(
		async (id: string) => {
			await client.coachplan.templates.discardDraft({ id });
			toast({ title: "Concept verwijderd", tone: "success" });
			await select(null);
			await reload();
		},
		{ error: "Verwijderen lukte niet" },
	);

	const upgrade = createAction(
		async (id: string) => {
			const tpl = await client.coachplan.templates.upgradeFromSource({ id });
			toast({ title: `Bijgewerkt naar versie ${tpl.version}`, tone: "success" });
			await select(tpl.id);
			await reload();
		},
		{ error: "Bijwerken lukte niet" },
	);

	// INC-34: the question to focus once it shows up after the reload.
	const [focusId, setFocusId] = createSignal<string | null>(null);
	const addQuestion = createAction(
		async (anchor?: { questionId: string; place: "before" | "after" }) => {
			const tid = selectedId();
			if (!tid) return;
			const q = await client.coachplan.questions.create({
				templateId: tid,
				label: "Nieuwe vraag",
				type: "short_text",
				section: "leerling",
				anchor,
			});
			setFocusId(q.id);
			await reload();
		},
		{ error: "Toevoegen lukte niet" },
	);

	// One shared createAction dropped a save while another was running, so a
	// quick second edit (wording, options, type) was silently lost. The ordered
	// saver keeps one request per question in flight and merges the rest. A
	// refused change is reported and dropped, not retried: resent with every
	// later edit, it would block the question.
	const questionSaver = createAnswerSaver(async (qid, patch) => {
		try {
			await client.coachplan.questions.update({ id: qid, ...patch });
		} catch (error) {
			toast({ title: "Opslaan lukte niet", description: friendlyError(error), tone: "danger" });
		}
		await reload();
	});

	const removeQuestion = createAction(
		async (qid: string) => {
			await client.coachplan.questions.remove({ id: qid });
			await reload();
		},
		{ error: "Verwijderen lukte niet" },
	);

	return (
		<section class="flex flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Formulierenmanager</h1>
				<p class="mt-1 text-body text-muted">
					Beheer coachplan-templates voor jouw school. Kopieer een
					Ondivera-template of stel je eigen vragenlijst samen.
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
				{/* Template list */}
				<div class="flex flex-col gap-3">
					<Card padding="sm" class="flex flex-col gap-2">
						<Input
							label="Nieuw schoolformulier"
							placeholder="Naam…"
							value={newName()}
							onInput={(e) => setNewName(e.currentTarget.value)}
						/>
						<Button
							size="sm"
							disabled={createTemplate.pending()}
							onClick={() => void createTemplate.run()}
						>
							Aanmaken
						</Button>
					</Card>

					<RouteDataView data={data().templates} what="de formulieren" onRetry={() => void reload()}>
						{(templates) => (
							<For each={templates()}>
								{(tpl) => (
									<Card
										padding="sm"
										class={cn(
											"flex flex-col gap-2",
											selectedId() === tpl.id ? "border-primary" : "border border-line",
										)}
									>
										<button
											type="button"
											class="flex min-w-0 flex-col items-start gap-2 text-left"
											onClick={() => void select(tpl.id)}
										>
											{/* Name and labels wrap inside the card (INC-23). */}
											<div class="flex min-w-0 flex-wrap items-center gap-2">
												<span class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{tpl.name}</span>
												<Badge variant="outline">v{tpl.version}</Badge>
												<Show when={tpl.publishedAt} fallback={<Badge variant="warning">Concept</Badge>}>
													<Badge variant="neutral">Gepubliceerd</Badge>
												</Show>
												<Show when={tpl.isSchoolDefault}>
													<Badge variant="success">Standaard</Badge>
												</Show>
											</div>
											<Badge variant={tpl.scope === "ondivera" ? "accent" : "primary"}>
												{tpl.scope === "ondivera" ? "Ondivera" : "School"}
											</Badge>
										</button>
										<div class="flex flex-wrap gap-2">
											<Show when={tpl.scope === "ondivera" && tpl.publishedAt}>
												<Button
													size="sm"
													variant="ghost"
													disabled={copyTemplate.pending()}
													onClick={() => void copyTemplate.run(tpl.id)}
												>
													Kopieer naar school
												</Button>
											</Show>
											<Show when={tpl.sourceUpdateVersion}>
												{(v) => (
													<div class="flex w-full flex-col gap-1.5 rounded-2 bg-accent-100/40 p-2">
														<p class="text-small text-ink-2">
															Ondivera heeft versie {v()} van dit formulier. Bijwerken
															vervangt de vragen door die van versie {v()}; eigen
															aanpassingen gaan niet mee. Ingevulde plannen blijven op hun
															versie.
														</p>
														<Button
															size="sm"
															variant="subtle"
															disabled={upgrade.pending()}
															onClick={() => void upgrade.run(tpl.id)}
														>
															Bijwerken naar versie {v()}
														</Button>
													</div>
												)}
											</Show>
											<Show when={tpl.scope === "school" && !tpl.isSchoolDefault && tpl.publishedAt}>
												<Button
													size="sm"
													variant="subtle"
													disabled={setDefault.pending()}
													onClick={() => void setDefault.run(tpl.id)}
												>
													Stel in als standaard
												</Button>
											</Show>
										</div>
									</Card>
								)}
							</For>
						)}
					</RouteDataView>
				</div>

				{/* Question editor */}
				<div class="flex flex-col gap-4">
					<Show
						when={selectedId() ? data().detail : null}
						fallback={
							<Card class="text-muted">
								Kies links een template om de vragen te bewerken.
							</Card>
						}
					>
						{(detail) => (
							<RouteDataView data={detail()} what="het formulier" onRetry={() => void reload()}>
								{(tpl) => (
									<TemplateEditor
										tpl={tpl()}
										mayManage={tpl().scope === "school" || me.hasAtLeast("superadmin")}
										onAddQuestion={(anchor) => void addQuestion.run(anchor)}
										adding={addQuestion.pending()}
										focusId={focusId()}
										onFocused={() => setFocusId(null)}
										onDiscard={() => void discard.run(tpl().id)}
										onPublish={() => void publish.run(tpl().id)}
										onNewVersion={() => void makeNewVersion.run(tpl().id)}
										onUpdate={(qid, patch) => questionSaver.save(qid, patch)}
										onRemove={(qid) => void removeQuestion.run(qid)}
									/>
								)}
							</RouteDataView>
						)}
					</Show>
				</div>
			</div>
		</section>
	);
}

function TemplateEditor(props: {
	tpl: TemplateDetail;
	mayManage: boolean;
	onAddQuestion: (anchor?: { questionId: string; place: "before" | "after" }) => void;
	adding: boolean;
	focusId: string | null;
	onFocused: () => void;
	onDiscard: () => void;
	onPublish: () => void;
	onNewVersion: () => void;
	onUpdate: (questionId: string, patch: Record<string, unknown>) => void;
	onRemove: (questionId: string) => void;
}) {
	const readOnly = () => !props.mayManage || !!props.tpl.inUse;
	const [previewOpen, setPreviewOpen] = createSignal(false);
	let previewButton: HTMLDivElement | undefined;
	// The dialog has no trigger of its own: give the focus back to the button.
	const closePreview = (open: boolean) => {
		setPreviewOpen(open);
		if (!open) requestAnimationFrame(() => previewButton?.querySelector("button")?.focus());
	};
	return (
		<>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="min-w-0 font-head text-h2 text-ink [overflow-wrap:anywhere]">
					{props.tpl.name} <span class="text-body text-muted">versie {props.tpl.version}</span>
				</h2>
				<div ref={previewButton} class="flex flex-wrap gap-2">
					{/* INC-32: try the form as coach and leerling; nothing is saved. */}
					<Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
						<Eye class="size-4" aria-hidden="true" />
						Voorbeeld bekijken
					</Button>
					<Show when={!readOnly()}>
						<Button size="sm" disabled={props.adding} onClick={() => props.onAddQuestion()}>
							+ Vraag toevoegen
						</Button>
					</Show>
				</div>
			</div>
			<Show when={previewOpen()}>
				<FormPreview
					open
					onOpenChange={closePreview}
					name={props.tpl.name}
					questions={props.tpl.questions as unknown as PreviewQuestion[]}
				/>
			</Show>
			<Show when={!props.mayManage}>
				<Card padding="sm" class="border-accent-100 bg-accent-100/30">
					<p class="text-small text-ink-2">
						Dit is een Ondivera-template (alleen-lezen). Kopieer hem
						naar je school om te bewerken.
					</p>
				</Card>
			</Show>
			<Show when={props.mayManage && !props.tpl.publishedAt}>
				<Card
					padding="sm"
					class="flex flex-wrap items-center justify-between gap-3 border-warning bg-warning-100"
				>
					<p class="text-small text-ink-2">
						Dit is een concept. Pas de vragen aan en publiceer het daarna; vanaf dan
						liggen de vragen van deze versie vast en kan hij gebruikt worden.
					</p>
					<div class="flex flex-wrap gap-2">
						<Button size="sm" variant="ghost" onClick={() => props.onDiscard()}>
							Concept verwijderen
						</Button>
						<Button size="sm" onClick={() => props.onPublish()}>
							Publiceren
						</Button>
					</div>
				</Card>
			</Show>
			<Show when={props.mayManage && props.tpl.inUse}>
				<Card
					padding="sm"
					class="flex flex-wrap items-center justify-between gap-3 border-accent-100 bg-accent-100/30"
				>
					<p class="text-small text-ink-2">
						{props.tpl.inUse} Deze versie blijft zoals hij is, zodat ingevulde
						plannen hun betekenis houden.
					</p>
					<Button size="sm" onClick={() => props.onNewVersion()}>
						Nieuwe versie maken
					</Button>
				</Card>
			</Show>

			{/* Keyed by id (INC-28): a reload after a save hands over new objects,
			    and keying by identity would rebuild every card and drop the focus. */}
			<For each={props.tpl.questions} keyed={(q) => q.id}>
				{(q, i) => (
					<QuestionCard
						q={q()}
						number={i() + 1}
						readOnly={readOnly()}
						adding={props.adding}
						focusOnMount={props.focusId === q().id}
						onFocused={() => props.onFocused()}
						onInsert={(place) => props.onAddQuestion({ questionId: q().id, place })}
						onUpdate={(patch) => props.onUpdate(q().id, patch)}
						onRemove={() => props.onRemove(q().id)}
					/>
				)}
			</For>
		</>
	);
}

function QuestionCard(props: {
	q: QuestionRow;
	number: number;
	readOnly: boolean;
	adding: boolean;
	focusOnMount: boolean;
	onFocused: () => void;
	onInsert: (place: "before" | "after") => void;
	onUpdate: (patch: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	let card: HTMLDivElement | undefined;
	// INC-28: the label is typed locally and saved when the field loses focus,
	// not on every keystroke. The writable memo follows the saved label when it
	// changes from elsewhere (another version, a reload). It follows the saved
	// text, not the question object: saving another field reloads the question,
	// and that must not wipe what is being typed here.
	const savedLabel = createMemo(() => props.q.label);
	const [label, setLabel] = createSignal(() => savedLabel());
	const saveLabel = () => {
		const next = label().trim();
		if (!props.readOnly && next && next !== props.q.label) props.onUpdate({ label: next });
	};
	// INC-31: the leerling wording, saved the same way; empty removes it.
	const savedLeerlingLabel = createMemo(() => props.q.leerlingLabel ?? "");
	const [leerlingLabel, setLeerlingLabel] = createSignal(() => savedLeerlingLabel());
	const saveLeerlingLabel = () => {
		const next = leerlingLabel().trim();
		if (!props.readOnly && next !== (props.q.leerlingLabel ?? "")) {
			props.onUpdate({ leerlingLabel: next || null });
		}
	};
	const isChoice = () => CHOICE_TYPES.includes(props.q.type);
	const typeValue = () => (isChoice() ? "choice" : props.q.type);
	const setType = (v: string) => {
		if (v === typeValue()) return;
		// "Meerkeuze" starts as "Eén optie mogelijk".
		props.onUpdate({ type: v === "choice" ? "single_choice" : v });
	};
	const setVariant = (v: string) => {
		if (v === variantOf(props.q)) return;
		props.onUpdate({
			type: v === "single" ? "single_choice" : "multiple_choice",
			options: { ...props.q.options, allowOther: v === "multiple_other" },
		});
	};

	// INC-34: a question inserted here gets the focus, so it can be edited
	// where it appeared.
	onSettled(() => {
		if (!props.focusOnMount || !card) return;
		card.scrollIntoView({ block: "center" });
		card.querySelector("input")?.focus();
		props.onFocused();
	});

	return (
		<Card padding="sm" class="flex flex-col gap-3">
			<div ref={card} class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="text-small font-medium text-ink-2">Vraag {props.number}</h3>
					<Badge variant={props.q.section === "coach" ? "accent" : "neutral"}>{props.q.section}</Badge>
					<Badge variant="outline">{typeLabel(props.q)}</Badge>
					<Show when={props.q.options?.theme}>
						<Badge variant="primary">{props.q.options?.theme}</Badge>
					</Show>
					<Show when={props.q.required}>
						<Badge variant="accent">Verplicht</Badge>
					</Show>
					<Show when={!props.q.visibleToLeerling}>
						<Badge variant="warning">Verborgen voor leerling</Badge>
					</Show>
				</div>
				<div onFocusOut={saveLabel}>
					<Input
						label="Vraag"
						value={label()}
						disabled={props.readOnly}
						onChange={(v) => setLabel(v)}
					/>
				</div>
				<div onFocusOut={saveLeerlingLabel}>
					<Input
						label="Vraag voor de leerling (mag leeg)"
						description="Dezelfde vraag in eenvoudige woorden. Leeg: de leerling ziet de vraag hierboven."
						value={leerlingLabel()}
						disabled={props.readOnly}
						onChange={(v) => setLeerlingLabel(v)}
					/>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<Select
						label="Type"
						options={QUESTION_TYPES}
						value={typeValue()}
						disabled={props.readOnly}
						onChange={(v) => v && !props.readOnly && setType(v)}
					/>
					<Select
						label="Gedeelte"
						options={SECTIONS}
						value={props.q.section}
						disabled={props.readOnly}
						onChange={(v) => v && !props.readOnly && props.onUpdate({ section: v })}
					/>
				</div>
				<Show when={isChoice()}>
					<Select
						label="Antwoordmogelijkheden"
						options={CHOICE_VARIANTS}
						value={variantOf(props.q)}
						disabled={props.readOnly}
						onChange={(v) => v && !props.readOnly && setVariant(v)}
					/>
					<ChoiceEditor
						q={props.q}
						number={props.number}
						readOnly={props.readOnly}
						onSave={(choices) => props.onUpdate({ options: { ...props.q.options, choices } })}
					/>
				</Show>
				<Switch
					label="Verplicht"
					description={
						props.q.section === "coach"
							? "De coach kan het plan pas aanbieden als deze vraag is beantwoord."
							: "De leerling kan het plan pas versturen als deze vraag is beantwoord, en kan hem niet overslaan."
					}
					checked={props.q.required}
					disabled={props.readOnly}
					onChange={(on) => !props.readOnly && props.onUpdate({ required: on })}
				/>
				<Switch
					label="Zichtbaar voor leerling"
					description="Toont deze vraag en het antwoord in het coachplan van de leerling, ook als de coach hem beantwoordt."
					checked={props.q.visibleToLeerling}
					disabled={props.readOnly}
					onChange={(on) => !props.readOnly && props.onUpdate({ visibleToLeerling: on })}
				/>
			</div>
			<Show when={!props.readOnly}>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="ghost"
							disabled={props.adding}
							onClick={() => props.onInsert("before")}
						>
							+ Vraag ervoor<span class="sr-only"> invoegen, vóór vraag {props.number}</span>
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={props.adding}
							onClick={() => props.onInsert("after")}
						>
							+ Vraag erna<span class="sr-only"> invoegen, na vraag {props.number}</span>
						</Button>
					</div>
					<Button
						size="sm"
						variant="danger"
						aria-label={`Vraag ${props.number} verwijderen`}
						onClick={() => props.onRemove()}
					>
						Verwijderen
					</Button>
				</div>
			</Show>
		</Card>
	);
}

type Choice = { value: string; label: string };

/**
 * INC-29: the answer options of a multiple choice question. Edited locally and
 * saved with one button, so a half-typed list never reaches the form; a list
 * that can't be saved stays as typed, with the reason.
 */
function ChoiceEditor(props: {
	q: QuestionRow;
	number: number;
	readOnly: boolean;
	onSave: (choices: Choice[]) => void;
}) {
	let list: HTMLDivElement | undefined;
	// The saved options as text: changes only when they do, so saving another
	// field of the question doesn't wipe what is being typed here.
	const saved = createMemo(() => JSON.stringify(props.q.options?.choices ?? []));
	const [rows, setRows] = createSignal<Choice[]>(() => {
		const choices = JSON.parse(saved()) as Choice[];
		return choices.length ? choices : [newChoice(), newChoice()];
	});
	const [problem, setProblem] = createSignal<string | null>(null);
	const dirty = () => JSON.stringify(rows()) !== saved();

	const edit = (value: string, label: string) =>
		setRows(rows().map((r) => (r.value === value ? { ...r, label } : r)));
	const remove = (index: number) => {
		setRows(rows().filter((_, i) => i !== index));
		// Keep the keyboard in the list: the next option, or the add button.
		requestAnimationFrame(() => {
			const inputs = list?.querySelectorAll("input");
			(inputs?.[Math.min(index, (inputs?.length ?? 1) - 1)] ?? list?.querySelector("button"))?.focus();
		});
	};
	const move = (index: number, by: -1 | 1) => {
		const next = [...rows()];
		const [row] = next.splice(index, 1);
		if (!row) return;
		next.splice(index + by, 0, row);
		setRows(next);
		// Moving the row moves its button; keep the focus on it.
		requestAnimationFrame(() =>
			list?.querySelector<HTMLButtonElement>(`[data-move="${row.value}:${by}"]`)?.focus(),
		);
	};
	const add = () => {
		const row = newChoice();
		setRows([...rows(), row]);
		requestAnimationFrame(() => {
			const inputs = list?.querySelectorAll("input");
			inputs?.[inputs.length - 1]?.focus();
		});
	};
	const save = () => {
		const cleaned = rows().map((r) => ({ ...r, label: r.label.trim() }));
		if (cleaned.some((r) => !r.label)) {
			setProblem("Vul bij elke antwoordoptie een tekst in, of verwijder de lege optie.");
			return;
		}
		if (cleaned.length < 2) {
			setProblem("Voeg minstens twee antwoordopties toe.");
			return;
		}
		setProblem(null);
		setRows(cleaned);
		props.onSave(cleaned);
	};

	return (
		<fieldset class="flex flex-col gap-2 rounded-2 border border-line p-3">
			<legend class="px-1 text-small font-medium text-ink-2">
				Antwoordopties<span class="sr-only"> bij vraag {props.number}</span>
			</legend>
			<div ref={list} class="flex flex-col gap-2">
				<For each={rows()} keyed={(r) => r.value}>
					{(row, i) => (
						<div class="flex items-end gap-1.5">
							<Input
								class="min-w-0 flex-1"
								label={`Optie ${i() + 1}`}
								value={row().label}
								disabled={props.readOnly}
								error={problem() && !row().label.trim() ? "Vul een tekst in." : undefined}
								onChange={(v) => edit(row().value, v)}
							/>
							<Show when={!props.readOnly}>
								<Button
									size="icon"
									variant="ghost"
									class="shrink-0"
									data-move={`${row().value}:-1`}
									disabled={i() === 0}
									aria-label={`Optie ${i() + 1} omhoog`}
									onClick={() => move(i(), -1)}
								>
									<ChevronUp class="size-4" aria-hidden="true" />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									class="shrink-0"
									data-move={`${row().value}:1`}
									disabled={i() === rows().length - 1}
									aria-label={`Optie ${i() + 1} omlaag`}
									onClick={() => move(i(), 1)}
								>
									<ChevronDown class="size-4" aria-hidden="true" />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									class="shrink-0"
									aria-label={`Optie ${i() + 1} verwijderen`}
									onClick={() => remove(i())}
								>
									<Trash2 class="size-4" aria-hidden="true" />
								</Button>
							</Show>
						</div>
					)}
				</For>
				<Show when={!props.readOnly}>
					<div class="flex flex-wrap items-center gap-2">
						<Button size="sm" variant="ghost" onClick={add}>
							+ Optie toevoegen
						</Button>
						<Button size="sm" disabled={!dirty()} onClick={save}>
							Opties opslaan
						</Button>
						<Show when={dirty()}>
							<span class="text-small text-muted">Nog niet opgeslagen</span>
						</Show>
					</div>
				</Show>
			</div>
			<Show when={problem()}>
				<p role="alert" class="text-small text-danger">
					{problem()}
				</p>
			</Show>
		</fieldset>
	);
}

const newChoice = (): Choice => ({ value: crypto.randomUUID().slice(0, 8), label: "" });

/** The variant of a multiple choice question (INC-29). */
function variantOf(q: QuestionRow): string {
	if (q.type === "single_choice") return "single";
	return q.options?.allowOther ? "multiple_other" : "multiple";
}

function typeLabel(q: QuestionRow): string {
	if (CHOICE_TYPES.includes(q.type)) {
		return CHOICE_VARIANTS.find((v) => v.value === variantOf(q))?.label ?? "Meerkeuze";
	}
	return QUESTION_TYPES.find((t) => t.value === q.type)?.label ?? q.type;
}
