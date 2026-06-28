import { createFileRoute } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Select } from "../../../../components/ui/select";
import { Input } from "../../../../components/ui/text-field";
import { toast } from "../../../../components/ui/toast";
import { requireRole } from "../../../../lib/auth/require-role";
import { client, orpc } from "../../../../lib/orpc";

/**
 * Formulierenmanager (#8/#9/#10) — keyuser+. Lists templates (Ondivera + own
 * school), lets you copy an Ondivera template into the school (#9), create a new
 * one, edit its questions with a per-question-type editor, and set the school
 * default (#10). Gated to keyuser+.
 */
export const Route = createFileRoute("/_protected/plan/beheer/")({
	beforeLoad: () => requireRole("keyuser"),
	component: FormManager,
});

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
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = createSignal<string | null>(null);

	const templatesQuery = useQuery(() =>
		orpc.coachplan.templates.list.queryOptions(),
	);
	const detailQuery = useQuery(() => ({
		...orpc.coachplan.templates.get.queryOptions({
			input: { id: selectedId() ?? "" },
		}),
		enabled: !!selectedId(),
	}));

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.coachplan.templates.list.key(),
		});
		if (selectedId()) {
			queryClient.invalidateQueries({
				queryKey: orpc.coachplan.templates.get.key({
					input: { id: selectedId() ?? "" },
				}),
			});
		}
	};

	const [newName, setNewName] = createSignal("");
	const createTemplate = async () => {
		const name = newName().trim();
		if (!name) return;
		try {
			const tpl = await client.coachplan.templates.create({ name });
			setNewName("");
			setSelectedId(tpl.id);
			invalidate();
			toast({ title: "Template aangemaakt", tone: "success" });
		} catch {
			toast({ title: "Aanmaken lukte niet", tone: "danger" });
		}
	};

	const copyTemplate = async (id: string) => {
		try {
			const tpl = await client.coachplan.templates.copyToSchool({ id });
			setSelectedId(tpl.id);
			invalidate();
			toast({ title: "Gekopieerd naar je school", tone: "success" });
		} catch {
			toast({ title: "Kopiëren lukte niet", tone: "danger" });
		}
	};

	const setDefault = async (id: string) => {
		try {
			await client.coachplan.templates.setSchoolDefault({ templateId: id });
			invalidate();
			toast({ title: "Standaardformulier ingesteld", tone: "success" });
		} catch {
			toast({ title: "Lukte niet (alleen schoolformulieren)", tone: "danger" });
		}
	};

	const addQuestion = async () => {
		const tid = selectedId();
		if (!tid) return;
		try {
			await client.coachplan.questions.create({
				templateId: tid,
				label: "Nieuwe vraag",
				type: "short_text",
				section: "leerling",
			});
			invalidate();
		} catch {
			toast({ title: "Toevoegen lukte niet", tone: "danger" });
		}
	};

	const updateQuestion = async (
		qid: string,
		patch: Record<string, unknown>,
	) => {
		try {
			await client.coachplan.questions.update({ id: qid, ...patch });
			invalidate();
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	const removeQuestion = async (qid: string) => {
		try {
			await client.coachplan.questions.remove({ id: qid });
			invalidate();
		} catch {
			toast({ title: "Verwijderen lukte niet", tone: "danger" });
		}
	};

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
						<Button size="sm" onClick={createTemplate}>
							Aanmaken
						</Button>
					</Card>

					<Show when={templatesQuery.isLoading}>
						<p class="text-muted">Laden…</p>
					</Show>
					<For each={templatesQuery.data}>
						{(tpl) => (
							<Card
								padding="sm"
								class="flex flex-col gap-2"
								classList={{
									"border-primary": selectedId() === tpl.id,
									"border border-line": selectedId() !== tpl.id,
								}}
							>
								<button
									type="button"
									class="text-left"
									onClick={() => setSelectedId(tpl.id)}
								>
									<div class="flex items-center gap-2">
										<span class="font-medium text-ink">{tpl.name}</span>
										<Show when={tpl.isSchoolDefault}>
											<Badge variant="success">Standaard</Badge>
										</Show>
									</div>
									<Badge variant={tpl.scope === "ondivera" ? "accent" : "primary"}>
										{tpl.scope === "ondivera" ? "Ondivera" : "School"}
									</Badge>
								</button>
								<div class="flex flex-wrap gap-2">
									<Show when={tpl.scope === "ondivera"}>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => copyTemplate(tpl.id)}
										>
											Kopieer naar school
										</Button>
									</Show>
									<Show when={tpl.scope === "school" && !tpl.isSchoolDefault}>
										<Button
											size="sm"
											variant="subtle"
											onClick={() => setDefault(tpl.id)}
										>
											Stel in als standaard
										</Button>
									</Show>
								</div>
							</Card>
						)}
					</For>
				</div>

				{/* Question editor */}
				<div class="flex flex-col gap-4">
					<Show
						when={selectedId() && detailQuery.data}
						fallback={
							<Card class="text-muted">
								Kies links een template om de vragen te bewerken.
							</Card>
						}
					>
						{(() => {
							const tpl = detailQuery.data;
							const readOnly = tpl?.scope === "ondivera";
							return (
								<>
									<div class="flex items-center justify-between gap-3">
										<h2 class="font-head text-h2 text-ink">{tpl?.name}</h2>
										<Show when={!readOnly}>
											<Button size="sm" onClick={addQuestion}>
												+ Vraag toevoegen
											</Button>
										</Show>
									</div>
									<Show when={readOnly}>
										<Card padding="sm" class="border-accent-100 bg-accent-100/30">
											<p class="text-small text-ink-2">
												Dit is een Ondivera-template (alleen-lezen). Kopieer hem
												naar je school om te bewerken.
											</p>
										</Card>
									</Show>

									<For each={tpl?.questions}>
										{(q) => (
											<Card padding="sm" class="flex flex-col gap-3">
												<div class="flex items-center gap-2">
													<Badge
														variant={q.section === "coach" ? "accent" : "neutral"}
													>
														{q.section}
													</Badge>
													<Badge variant="outline">{q.type}</Badge>
													<Show when={q.options?.theme}>
														<Badge variant="primary">{q.options?.theme}</Badge>
													</Show>
												</div>
												<Input
													label="Vraag"
													value={q.label}
													disabled={readOnly}
													onChange={(v) =>
														!readOnly && updateQuestion(q.id, { label: v })
													}
												/>
												<div class="grid gap-3 sm:grid-cols-2">
													<Select
														label="Type"
														options={QUESTION_TYPES}
														value={q.type}
														disabled={readOnly}
														onChange={(v) =>
															v && !readOnly && updateQuestion(q.id, { type: v })
														}
													/>
													<Select
														label="Gedeelte"
														options={SECTIONS}
														value={q.section}
														disabled={readOnly}
														onChange={(v) =>
															v &&
															!readOnly &&
															updateQuestion(q.id, { section: v })
														}
													/>
												</div>
												<Show when={!readOnly}>
													<div class="flex justify-end">
														<Button
															size="sm"
															variant="danger"
															onClick={() => removeQuestion(q.id)}
														>
															Verwijderen
														</Button>
													</div>
												</Show>
											</Card>
										)}
									</For>
								</>
							);
						})()}
					</Show>
				</div>
			</div>
		</section>
	);
}
