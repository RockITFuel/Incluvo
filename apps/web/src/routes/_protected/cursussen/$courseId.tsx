import { atLeast, canBuildCourses, type UserRole } from "@incluvo/permissions";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/solid-router";
import {
	ArrowLeft,
	Eye,
	EyeOff,
	GitBranch,
	Lightbulb,
	Sparkles,
} from "../../../lib/icons";
import { createEffect, createSignal, For, Show } from "solid-js";
import { type BlockDTO, BlockView } from "../../../components/courses/block-view";
import { CourseBuilder } from "../../../components/courses/course-builder";
import { GradingView } from "../../../components/courses/grading-view";
import { CourseProgressBar } from "../../../components/courses/progress-bar";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog } from "../../../components/ui/dialog";
import { SegmentedControl } from "../../../components/ui/segmented-control";
import { Select } from "../../../components/ui/select";
import { Input, Textarea } from "../../../components/ui/text-field";
import { toast } from "../../../components/ui/toast";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { createAction } from "../../../lib/action";
import { useMe } from "../../../lib/auth/use-me";
import { createLoad } from "../../../lib/load";
import { client, type Output } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { granted, loadRouteData } from "../../../lib/route-data";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Course detail (#23–#36, #61). Role-branched:
 *  - leerling: view sections/blocks per type with a voortgangsbalk (#24), submit
 *    assignments (#27), mark blocks done, see only recommended/active content by
 *    default (#35), and propose their own assignment (#61).
 *  - ontwikkelaar/keyuser: a "Bouwen" tab with the section/block builder.
 *  - coach+: a "Beoordelen" tab (#28) and the voortgangsbalk-oogje (#24).
 */
type CourseSearch = {
	/** Which tab opens (back from the block editor: bouwen). */
	tab?: "leren" | "bouwen" | "beoordelen";
	/**
	 * The block to put the focus on (INC-26), also from a notification (INC-30);
	 * `voorstellen` is the list of proposed opdrachten.
	 */
	blok?: string;
};

export const Route = createFileRoute("/_protected/cursussen/$courseId")({
	validateSearch: (search: Record<string, unknown>): CourseSearch => ({
		tab:
			search.tab === "bouwen" || search.tab === "beoordelen" || search.tab === "leren"
				? search.tab
				: undefined,
		blok: typeof search.blok === "string" ? search.blok : undefined,
	}),
	loader: async ({ context, params, abortController }) => {
		const signal = abortController.signal;
		const role = context.me.role as UserRole;
		const coach = atLeast(role, "coach");
		const [tree, defaultLabels, proposals] = await Promise.all([
			loadRouteData(signal, (s) => client.courses.tree({ id: params.courseId }, { signal: s })),
			// Full standaard-vocabulaire for the bouwer (#36): content is labelled for
			// ALL leerstijlen, not just this leerling's — each leerling then sees their
			// own subset recommended. Without this, every labelled block would match by
			// construction and the "alleen aanbevolen" filter could never hide anything.
			coach || canBuildCourses(role)
				? loadRouteData(signal, (s) => client.coachplan.defaultLabels(undefined, { signal: s }))
				: null,
			coach
				? loadRouteData(signal, (s) =>
						client.courses.listProposals({ courseId: params.courseId }, { signal: s }),
					)
				: null,
		]);
		return { tree, defaultLabels, proposals };
	},
	component: CourseDetail,
});

type Proposal = Output<typeof client.courses.listProposals>[number];

const kindLabel: Record<string, string> = {
	ondivera_template: "Ondivera-sjabloon",
	school_template: "Schooltemplate",
	student_execution: "Mijn cursus",
};

function CourseDetail() {
	const params = Route.useParams();
	const me = useMe();
	const router = useRouter();
	const loaded = Route.useLoaderData();
	const courseId = () => params().courseId;
	const tree = () => granted(loaded().tree);

	useServerEvent("course.changed", () => void refresh(router, "courses"));

	const search = Route.useSearch();
	const [view, setView] = createSignal<"leren" | "bouwen" | "beoordelen">(
		() => search().tab ?? "leren",
	);
	// Back from the block editor: the focus goes to the block that was edited.
	createEffect(
		() => (tree() ? search().blok : undefined),
		(blok) => {
			if (!blok) return;
			requestAnimationFrame(() => {
				const el = document.getElementById(`blok-${blok}`);
				el?.scrollIntoView({ block: "center" });
				el?.focus();
			});
		},
	);
	// A block someone was sent to is shown, recommended or not.
	const [onlyRecommended, setOnlyRecommended] = createSignal(() => !search().blok);
	// The prototype's personal hide/show "oogje" on the progress strip (client-only;
	// the coach's server-side progressBarHidden #24 stays a separate control below).
	const [localHideProgress, setLocalHideProgress] = createSignal(false);

	/** Reload this course (and every other course view in the route cache). */
	const refetch = () => refresh(router, "courses");

	const tabs = () => {
		const t: { value: string; label: string }[] = [
			{ value: "leren", label: "Cursus" },
		];
		if (canBuild()) t.push({ value: "bouwen", label: "Bouwen" });
		if (me.hasAtLeast("coach")) t.push({ value: "beoordelen", label: "Beoordelen" });
		return t;
	};

	const canComplete = () => me.is("leerling") || me.hasAtLeast("coach");
	const navigate = useNavigate();
	// Templates are built by course builders; a leerling's own copy may be
	// adapted by someone coaching them (the server checks the leerling rule).
	const canBuild = () =>
		tree()?.course.kind === "student_execution"
			? me.hasAtLeast("coach")
			: me.canBuildCourses();

	return (
		<section class="flex flex-col gap-5">
			<div class="ds-row ds-between">
				<Link to="/cursussen" style={{ "text-decoration": "none" }}>
					<span class="btn ghost sm">
						<ArrowLeft style={{ width: "14px", height: "14px" }} /> Cursussen
					</span>
				</Link>
				<Show when={tree()}>
					{(data) => (
						<div class="ds-row" style={{ gap: "8px" }}>
							<Show when={me.canBuildCourses() || me.hasAtLeast("coach")}>
								<DeriveDialog course={data().course} onDone={refetch} />
							</Show>
							<Show when={me.hasAtLeast("coach")}>
								<Button
									variant="ghost"
									size="sm"
									onClick={async () => {
										await client.courses.setProgressBarHidden({
											id: courseId(),
											hidden: !data().course.progressBarHidden,
										});
										toast({
											title: data().course.progressBarHidden
												? "Voortgangsbalk getoond"
												: "Voortgangsbalk verborgen",
										});
										await refetch();
									}}
								>
									<Show
										when={data().course.progressBarHidden}
										fallback={
											<>
												<EyeOff class="size-4" /> Verberg balk
											</>
										}
									>
										<Eye class="size-4" /> Toon balk
									</Show>
								</Button>
							</Show>
						</div>
					)}
				</Show>
			</div>

			<Show when={tree()?.sourceChanged && canBuild() && tree()}>
				{(data) => (
					<Card class="flex flex-wrap items-center justify-between gap-3 border-accent-100 bg-accent-100/30">
						<p class="text-small text-ink-2">
							De Ondivera-cursus waar deze kopie van is gemaakt, is sindsdien
							gewijzigd. Maak een nieuwe kopie om de wijzigingen over te nemen;
							deze cursus blijft zoals hij is.
						</p>
						<Button
							size="sm"
							onClick={async () => {
								try {
									const copy = await client.courses.derive({
										id: data().course.parentCourseId!,
										kind: "school_template",
										title: data().course.title,
									});
									toast({ title: "Nieuwe kopie gemaakt", tone: "success" });
									navigate({ to: "/cursussen/$courseId", params: { courseId: copy.id } });
								} catch (err) {
									toast({
										title: "Kopiëren lukte niet",
										description: (err as Error).message,
										tone: "danger",
									});
								}
							}}
						>
							Nieuwe kopie maken
						</Button>
					</Card>
				)}
			</Show>

			<RouteDataView data={loaded().tree} what="de cursus" onRetry={() => void refetch()}>
				{(data) => {
					const visibleBlocks = (section: { blocks: BlockDTO[] }) =>
						me.is("leerling") && onlyRecommended()
							? section.blocks.filter((b) => b.recommended)
							: section.blocks;
					// The first not-yet-done progress block gets the accent "Verder" state.
					const firstActiveId = () => {
						for (const section of data().sections) {
							for (const b of visibleBlocks(section)) {
								if (!b.completed && b.countsForProgress) return b.id;
							}
						}
						return undefined;
					};
					const leervoorkeurenText = () =>
						data().leervoorkeuren.length > 0
							? data().leervoorkeuren.join(", ")
							: "jouw leervoorkeuren";
					return (
						<>
							<Show when={tabs().length > 1}>
								<SegmentedControl
									options={tabs()}
									value={view()}
									onChange={(v) => setView((v as never) ?? "leren")}
								/>
							</Show>

							{/* ── Cursus (leerling + default) ──────────────────────────── */}
							<Show when={view() === "leren"}>
								<div class="card" style={{ padding: "0", overflow: "hidden" }}>
									<div
										style={{
											height: "140px",
											background:
												"linear-gradient(135deg, rgb(var(--primary)), rgb(var(--primary-700)))",
											position: "relative",
											padding: "24px",
											color: "#fff",
											display: "flex",
											"align-items": "flex-end",
										}}
									>
										<div>
											<div
												style={{
													"font-size": "0.8125rem",
													opacity: "0.85",
													"margin-bottom": "6px",
												}}
											>
												{kindLabel[data().course.kind]}
											</div>
											<h1 style={{ color: "#fff", "font-size": "1.875rem" }}>
												{data().course.title}
											</h1>
										</div>
									</div>

									<Show when={!data().course.progressBarHidden}>
										<div
											style={{
												padding: "16px 24px",
												"border-bottom": "1px solid rgb(var(--line))",
												display: "flex",
												"align-items": "center",
												gap: "16px",
											}}
										>
											<div class="ds-grow">
												<Show
													when={!localHideProgress()}
													fallback={
														<div
															style={{
																"font-size": "0.8125rem",
																color: "rgb(var(--muted))",
															}}
														>
															Voortgang verborgen
														</div>
													}
												>
													<CourseProgressBar
														percent={data().progress.percent}
														done={data().progress.done}
														total={data().progress.total}
													/>
												</Show>
											</div>
											<button
												type="button"
												class="btn ghost sm"
												title={
													localHideProgress()
														? "Voortgang tonen"
														: "Voortgang verbergen"
												}
												aria-pressed={localHideProgress() ? "true" : "false"}
												onClick={() => setLocalHideProgress((v) => !v)}
											>
												<Show
													when={localHideProgress()}
													fallback={<EyeOff class="size-4" />}
												>
													<Eye class="size-4" />
												</Show>
											</button>
										</div>
									</Show>

									<Show when={me.is("leerling")}>
										<div
											style={{
												padding: "14px 24px",
												background: "rgb(var(--bg-2))",
												display: "flex",
												"align-items": "center",
												gap: "10px",
												"font-size": "0.8125rem",
												color: "rgb(var(--muted))",
												"flex-wrap": "wrap",
											}}
										>
											<Sparkles style={{ width: "14px", height: "14px" }} />
											<span>
												Aanbevolen op basis van jouw leervoorkeuren:{" "}
												<strong style={{ color: "rgb(var(--primary-700))" }}>
													{leervoorkeurenText()}
												</strong>
												.
											</span>
											<button
												type="button"
												onClick={() => setOnlyRecommended((v) => !v)}
												style={{
													"margin-left": "auto",
													background: "transparent",
													border: "0",
													color: "rgb(var(--primary))",
													"font-weight": "500",
													"font-size": "0.8125rem",
													cursor: "pointer",
												}}
											>
												{onlyRecommended()
													? "Toon alles →"
													: "Alleen aanbevolen →"}
											</button>
										</div>
									</Show>
								</div>

								<Show when={me.is("leerling")}>
									<div class="ds-row ds-between">
										<span class="text-small text-muted">
											{onlyRecommended()
												? "Je ziet alleen aanbevolen content."
												: "Je ziet alle content."}
										</span>
										<ProposeDialog courseId={courseId()} onDone={refetch} />
									</div>
								</Show>

								<For each={data().sections}>
									{(section) => (
										<Show when={visibleBlocks(section).length > 0}>
											<div class="ds-col" style={{ gap: "12px" }}>
												<div
													style={{
														"font-family": "var(--font-head)",
														"font-size": "1.125rem",
														"font-weight": "600",
													}}
												>
													{section.title}
												</div>
												<div class="ds-col" style={{ gap: "8px" }}>
													<For each={visibleBlocks(section)}>
														{(block) => (
															<BlockView
																block={block}
																courseId={courseId()}
																canComplete={canComplete()}
																active={block.id === firstActiveId()}
																focused={block.id === search().blok}
																onToggleDone={async (completed) => {
																	await client.courses.setProgress({
																		id: block.id,
																		completed,
																	});
																	await refetch();
																}}
															/>
														)}
													</For>
												</div>
											</div>
										</Show>
									)}
								</For>

								<Show when={data().sections.length === 0}>
									<Card class="text-muted">
										Deze cursus heeft nog geen inhoud.
									</Card>
								</Show>

								<Show when={loaded().proposals && granted(loaded().proposals!)}>
									{(proposals) => <ProposalsList proposals={proposals()} />}
								</Show>
							</Show>

							{/* ── Bouwen (ontwikkelaar/keyuser) ────────────────────────── */}
							<Show when={view() === "bouwen" && canBuild()}>
								<CourseBuilder
									courseId={courseId()}
									courseTitle={data().course.title}
									courseKindLabel={kindLabel[data().course.kind] ?? ""}
									progressBarHidden={data().course.progressBarHidden}
									sections={data().sections}
									availableLabels={[
										...new Set([
											...((loaded().defaultLabels && granted(loaded().defaultLabels!)) ?? []).map(
												(l) => l.label,
											),
											...data().leervoorkeuren,
										]),
									]}
									refetch={refetch}
								/>
							</Show>

							{/* ── Beoordelen (coach+) ──────────────────────────────────── */}
							<Show when={view() === "beoordelen" && me.hasAtLeast("coach")}>
								<h1 class="font-head text-h1 text-ink">
									Beoordelen — {data().course.title}
								</h1>
								<GradingView sections={data().sections} />
							</Show>
						</>
					);
				}}
			</RouteDataView>
		</section>
	);
}

/** Derive a copy: Ondivera template → school template, or school → student. */
function DeriveDialog(props: {
	course: { id: string; kind: string; title: string };
	onDone: () => void;
}) {
	const [open, setOpen] = createSignal(false);
	const [leerlingId, setLeerlingId] = createSignal<string | undefined>();
	const [busy, setBusy] = createSignal(false);

	// Giving a leerling a course is coach work (D4: an ontwikkelaar builds
	// courses only); offer only the leerlingen this user may see.
	const me = useMe();
	const canAssign = () => me.hasAtLeast("coach");
	// The leerlingen to pick from load when the dialog opens.
	const leerlingLoad = createLoad(
		() => open() && props.course.kind === "school_template" && canAssign(),
		(_, signal) => client.dashboard.overview(undefined, { signal }),
	);
	const leerlingen = () => (leerlingLoad.data() ?? []).map((row) => row.leerling);

	const targetKind = () =>
		props.course.kind === "ondivera_template"
			? "school_template"
			: "student_execution";

	const canDerive = () =>
		props.course.kind === "ondivera_template" ||
		(props.course.kind === "school_template" && canAssign());

	const derive = async () => {
		setBusy(true);
		try {
			await client.courses.derive({
				id: props.course.id,
				kind: targetKind() as never,
				leerlingId:
					targetKind() === "student_execution" ? leerlingId() : undefined,
			});
			toast({ title: "Cursus afgeleid", tone: "success" });
			setOpen(false);
			props.onDone();
		} catch (err) {
			toast({
				title: "Afleiden mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Show when={canDerive()}>
			<Dialog
				open={open()}
				onOpenChange={setOpen}
				title="Cursus afleiden"
				description={
					targetKind() === "school_template"
						? "Maak een schooltemplate van dit Ondivera-sjabloon."
						: "Maak een leerlinguitvoering van deze schooltemplate."
				}
				trigger={{
					variant: "ghost",
					size: "sm",
					children: (
						<>
							<GitBranch class="size-4" aria-hidden="true" /> Afleiden
						</>
					),
				}}
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Annuleren
						</Button>
						<Button
							onClick={derive}
							disabled={
								busy() ||
								(targetKind() === "student_execution" && !leerlingId())
							}
						>
							{busy() ? "Bezig…" : "Afleiden"}
						</Button>
					</>
				}
			>
				<Show when={targetKind() === "student_execution"}>
					<Select
						label="Leerling"
						placeholder="Kies een leerling"
						options={leerlingen().map((u) => ({ value: u.id, label: u.name }))}
						value={leerlingId()}
						onChange={setLeerlingId}
					/>
				</Show>
			</Dialog>
		</Show>
	);
}

/** Leerling proposes their own assignment (#61). */
function ProposeDialog(props: { courseId: string; onDone: () => void }) {
	const [open, setOpen] = createSignal(false);
	const [title, setTitle] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [busy, setBusy] = createSignal(false);

	const propose = async () => {
		setBusy(true);
		try {
			await client.courses.proposeAssignment({
				courseId: props.courseId,
				title: title(),
				description: description() || undefined,
			});
			toast({
				title: "Voorstel verstuurd",
				description: "Je coach bespreekt het met je.",
				tone: "success",
			});
			setOpen(false);
			setTitle("");
			setDescription("");
			props.onDone();
		} catch (err) {
			toast({
				title: "Versturen mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open={open()}
			onOpenChange={setOpen}
			title="Eigen opdracht voorstellen"
			description="Bedenk zelf hoe je wilt laten zien wat je geleerd hebt."
			trigger={{
				variant: "subtle",
				size: "sm",
				children: (
					<>
						<Lightbulb class="size-4" aria-hidden="true" /> Eigen opdracht
					</>
				),
			}}
			footer={
				<>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Annuleren
					</Button>
					<Button onClick={propose} disabled={busy() || !title().trim()}>
						{busy() ? "Bezig…" : "Versturen"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-3">
				<Input
					label="Titel"
					value={title()}
					onInput={(e) => setTitle(e.currentTarget.value)}
					required
				/>
				<Textarea
					label="Hoe wil je dit aantonen?"
					value={description()}
					onInput={(e) => setDescription(e.currentTarget.value)}
				/>
			</div>
		</Dialog>
	);
}

/** Coach view of leerling-proposed assignments (#61). */
function ProposalsList(props: { proposals: Proposal[] }) {
	const router = useRouter();
	const respond = createAction(
		async (id: string, status: "accepted" | "rejected") => {
			await client.courses.respondProposal({ id, status });
			toast({ title: status === "accepted" ? "Geaccepteerd" : "Afgewezen" });
			await refresh(router, "courses");
		},
		{ error: "Dat lukte niet" },
	);

	return (
		<Show when={props.proposals.length > 0}>
			<Card id="blok-voorstellen" tabindex="-1" class="flex flex-col gap-3">
				<h2 class="font-head text-h3 text-ink">
					<Lightbulb class="inline size-4" /> Eigen opdracht-voorstellen
				</h2>
				<For each={props.proposals}>
					{(p) => (
						<div class="flex items-start justify-between gap-3 rounded-2 border border-line p-3">
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-ink">{p.title}</span>
									<Badge
										variant={
											p.status === "accepted"
												? "success"
												: p.status === "rejected"
													? "danger"
													: "warning"
										}
									>
										{p.status}
									</Badge>
								</div>
								<Show when={p.description}>
									<p class="text-small text-muted">{p.description}</p>
								</Show>
								<p class="text-micro text-muted">
									Van {p.leerlingName ?? "leerling"}
								</p>
							</div>
							<Show when={p.status === "proposed"}>
								<div class="flex gap-1">
									<Button
										variant="subtle"
										size="sm"
										disabled={respond.pending()}
										onClick={() => void respond.run(p.id, "accepted")}
									>
										Accepteer
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={respond.pending()}
										onClick={() => void respond.run(p.id, "rejected")}
									>
										Wijs af
									</Button>
								</div>
							</Show>
						</div>
					)}
				</For>
			</Card>
		</Show>
	);
}
