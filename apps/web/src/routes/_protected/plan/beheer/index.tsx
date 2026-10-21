import { createFileRoute, useNavigate, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { RouteDataView } from "../../../../components/ui/route-data-view";
import { Select } from "../../../../components/ui/select";
import { Switch } from "../../../../components/ui/switch";
import { Input } from "../../../../components/ui/text-field";
import { toast } from "../../../../components/ui/toast";
import { createAction } from "../../../../lib/action";
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

const QUESTION_TYPES = [
	{ value: "short_text", label: "Korte tekst" },
	{ value: "long_text", label: "Lange tekst" },
	{ value: "single_choice", label: "Eén keuze" },
	{ value: "multiple_choice", label: "Meerdere keuzes" },
	{ value: "scale", label: "Schaal" },
	{ value: "boolean", label: "Ja / nee" },
	{ value: "smiley", label: "Smileys" },
	{ value: "leervoorkeur", label: "Leervoorkeur (trigger)" },
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

	const addQuestion = createAction(
		async () => {
			const tid = selectedId();
			if (!tid) return;
			await client.coachplan.questions.create({
				templateId: tid,
				label: "Nieuwe vraag",
				type: "short_text",
				section: "leerling",
			});
			await reload();
		},
		{ error: "Toevoegen lukte niet" },
	);

	const updateQuestion = createAction(
		async (qid: string, patch: Record<string, unknown>) => {
			await client.coachplan.questions.update({ id: qid, ...patch });
			await reload();
		},
		{ error: "Opslaan lukte niet" },
	);

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
										onAddQuestion={() => void addQuestion.run()}
										onDiscard={() => void discard.run(tpl().id)}
										onPublish={() => void publish.run(tpl().id)}
										onNewVersion={() => void makeNewVersion.run(tpl().id)}
										onUpdate={(qid, patch) => void updateQuestion.run(qid, patch)}
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
	onAddQuestion: () => void;
	onDiscard: () => void;
	onPublish: () => void;
	onNewVersion: () => void;
	onUpdate: (questionId: string, patch: Record<string, unknown>) => void;
	onRemove: (questionId: string) => void;
}) {
	const readOnly = () => !props.mayManage || !!props.tpl.inUse;
	return (
		<>
			<div class="flex items-center justify-between gap-3">
				<h2 class="font-head text-h2 text-ink">
					{props.tpl.name} <span class="text-body text-muted">versie {props.tpl.version}</span>
				</h2>
				<Show when={!readOnly()}>
					<Button size="sm" onClick={() => props.onAddQuestion()}>
						+ Vraag toevoegen
					</Button>
				</Show>
			</div>
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
					<div class="flex gap-2">
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
				{(q) => (
					<QuestionCard
						q={q()}
						readOnly={readOnly()}
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
	readOnly: boolean;
	onUpdate: (patch: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	// INC-28: the label is typed locally and saved when the field loses focus,
	// not on every keystroke. The writable memo follows the saved label when it
	// changes from elsewhere (another version, a reload).
	const [label, setLabel] = createSignal(() => props.q.label);
	const saveLabel = () => {
		const next = label().trim();
		if (!props.readOnly && next && next !== props.q.label) props.onUpdate({ label: next });
	};
	return (
		<Card padding="sm" class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<Badge variant={props.q.section === "coach" ? "accent" : "neutral"}>{props.q.section}</Badge>
				<Badge variant="outline">{props.q.type}</Badge>
				<Show when={props.q.options?.theme}>
					<Badge variant="primary">{props.q.options?.theme}</Badge>
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
			<div class="grid gap-3 sm:grid-cols-2">
				<Select
					label="Type"
					options={QUESTION_TYPES}
					value={props.q.type}
					disabled={props.readOnly}
					onChange={(v) => v && !props.readOnly && props.onUpdate({ type: v })}
				/>
				<Select
					label="Gedeelte"
					options={SECTIONS}
					value={props.q.section}
					disabled={props.readOnly}
					onChange={(v) => v && !props.readOnly && props.onUpdate({ section: v })}
				/>
			</div>
			<Switch
				label="Zichtbaar voor leerling"
				description="Toont deze vraag en het antwoord in het coachplan van de leerling, ook als de coach hem beantwoordt."
				checked={props.q.visibleToLeerling}
				disabled={props.readOnly}
				onChange={(on) => !props.readOnly && props.onUpdate({ visibleToLeerling: on })}
			/>
			<Show when={!props.readOnly}>
				<div class="flex justify-end">
					<Button size="sm" variant="danger" onClick={() => props.onRemove()}>
						Verwijderen
					</Button>
				</div>
			</Show>
		</Card>
	);
}
