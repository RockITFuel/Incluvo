import { canBuildCourses, type UserRole } from "@incluvo/permissions";
import { createFileRoute, useBlocker, useNavigate, useRouter } from "@tanstack/solid-router";
import { createEffect, createSignal, onSettled, Show } from "solid-js";
import {
	BlockEditor,
	type BlockDraft,
	type BlockType,
	draftOf,
} from "../../../components/courses/block-editor";
import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { toast } from "../../../components/ui/toast";
import { requireRole } from "../../../lib/auth/role-guard";
import { client } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { granted, loadRouteData } from "../../../lib/route-data";
import { friendlyError } from "../../../lib/errors";

type BlockSearch = { sectie?: string; type?: BlockType };

const TYPES: BlockType[] = ["pagina", "youtube", "bestand", "opdracht"];

/**
 * Add or edit one content block on a full screen (INC-26). `blockId` is
 * `nieuw` for a new block, with `?sectie=` (and optionally `?type=`). Leaving
 * with unsaved changes — Annuleren, Esc, the browser's back button or closing
 * the tab — asks first. After saving, the course opens on the Bouwen tab with
 * the focus on the block.
 */
export const Route = createFileRoute("/_protected/cursussen/$courseId_/blok/$blockId")({
	validateSearch: (search: Record<string, unknown>): BlockSearch => ({
		sectie: typeof search.sectie === "string" ? search.sectie : undefined,
		type: TYPES.includes(search.type as BlockType) ? (search.type as BlockType) : undefined,
	}),
	// Builders, and coaches adapting a leerling's own copy (the server decides).
	beforeLoad: ({ context }) => requireRole(context.me, { min: "ontwikkelaar" }),
	loader: async ({ context, params, abortController }) => {
		const signal = abortController.signal;
		const role = context.me.role as UserRole;
		const [tree, labels] = await Promise.all([
			loadRouteData(signal, (s) => client.courses.tree({ id: params.courseId }, { signal: s })),
			canBuildCourses(role) || role === "coach"
				? loadRouteData(signal, (s) => client.coachplan.defaultLabels(undefined, { signal: s }))
				: null,
		]);
		return { tree, labels };
	},
	component: BlockEditorPage,
});

function BlockEditorPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const loaded = Route.useLoaderData();
	const navigate = useNavigate();
	const router = useRouter();

	const isNew = () => params().blockId === "nieuw";
	const block = () =>
		granted(loaded().tree)
			?.sections.flatMap((s) => s.blocks)
			.find((b) => b.id === params().blockId) ?? null;
	const sectionId = () =>
		isNew()
			? search().sectie
			: granted(loaded().tree)?.sections.find((s) => s.blocks.some((b) => b.id === params().blockId))
					?.id;

	// The draft starts from the block (or an empty one) and follows the form.
	const [draft, setDraft] = createSignal<BlockDraft>(() =>
		draftOf(block(), search().type ?? "pagina"),
	);
	const [initial, setInitial] = createSignal(() =>
		JSON.stringify(draftOf(block(), search().type ?? "pagina")),
	);
	const dirty = () => JSON.stringify(draft()) !== initial();
	const [saving, setSaving] = createSignal(false);
	// Leaving after a save must not ask; a plain flag, read by the blocker.
	let leaving = false;

	const backToCourse = (blockId?: string) =>
		navigate({
			to: "/cursussen/$courseId",
			params: { courseId: params().courseId },
			search: { tab: "bouwen", blok: blockId ?? (isNew() ? undefined : params().blockId) },
		});

	const blocker = useBlocker({
		shouldBlockFn: () => !leaving && dirty(),
		enableBeforeUnload: () => !leaving && dirty(),
		withResolver: true,
	});

	const save = async () => {
		const d = draft();
		if (!d.title.trim()) {
			toast({ title: "Geef het blok een titel", tone: "danger" });
			return;
		}
		const sectie = sectionId();
		if (!sectie) {
			toast({ title: "Kies eerst een sectie", tone: "danger" });
			return;
		}
		const assignment = {
			name: d.asgName.trim() || d.title.trim(),
			description: d.asgDescription || null,
			responseType: d.responseType,
			dueAt: d.dueAt ? new Date(`${d.dueAt}T00:00:00`) : null,
		};
		setSaving(true);
		try {
			let id = params().blockId;
			if (isNew()) {
				const created = await client.courses.addBlock({
					sectionId: sectie,
					type: d.type,
					title: d.title.trim(),
					body: d.type === "pagina" ? d.body : undefined,
					youtube: d.type === "youtube" ? d.youtube : undefined,
					fileStorageKey: d.type === "bestand" ? (d.fileStorageKey ?? undefined) : undefined,
					labels: d.labels,
					countsForProgress: d.countsForProgress,
					assignment:
						d.type === "opdracht"
							? {
									...assignment,
									description: assignment.description ?? undefined,
									dueAt: assignment.dueAt ?? undefined,
								}
							: undefined,
				});
				id = created.id;
			} else {
				await client.courses.updateBlock({
					id,
					title: d.title.trim(),
					body: d.type === "pagina" ? d.body : undefined,
					youtube: d.type === "youtube" && d.youtube ? d.youtube : undefined,
					fileStorageKey: d.type === "bestand" ? (d.fileStorageKey ?? undefined) : undefined,
					labels: d.labels,
					countsForProgress: d.countsForProgress,
					assignment: d.type === "opdracht" ? assignment : undefined,
				});
			}
			toast({ title: isNew() ? "Blok toegevoegd" : "Wijzigingen opgeslagen", tone: "success" });
			leaving = true;
			await refresh(router, "courses");
			await backToCourse(id);
		} catch (err) {
			toast({ title: "Opslaan lukte niet", description: friendlyError(err), tone: "danger" });
		} finally {
			setSaving(false);
		}
	};

	// Esc leaves too (and asks when there are changes), unless a dialog of the
	// editor itself is open: that one closes first.
	onSettled(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (document.querySelector('[role="dialog"]')) return;
			e.preventDefault();
			void backToCourse();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// Opening the editor puts the focus on the title.
	createEffect(
		() => granted(loaded().tree),
		(tree) => {
			if (!tree) return;
			requestAnimationFrame(() =>
				document.querySelector<HTMLInputElement>('[data-block-editor] input')?.focus(),
			);
		},
	);

	return (
		<RouteDataView data={loaded().tree} what="de cursus" onRetry={() => void refresh(router, "courses")}>
			{(tree) => (
				<Show
					when={isNew() || block()}
					fallback={
						<p class="text-body text-muted">Dit blok bestaat niet (meer) in deze cursus.</p>
					}
				>
					<div data-block-editor>
						<BlockEditor
							draft={draft()}
							isNew={isNew()}
							courseTitle={tree().course.title}
							availableLabels={[
								...new Set([
									...((loaded().labels && granted(loaded().labels!)) ?? []).map((l) => l.label),
									...tree().leervoorkeuren,
								]),
							]}
							saving={saving()}
							onChange={(update) => setDraft((d) => update(d))}
							onSave={() => void save()}
							onCancel={() => void backToCourse()}
						/>
					</div>
					<Dialog
						open={blocker().status === "blocked"}
						onOpenChange={(open) => {
							if (!open) blocker().reset?.();
						}}
						title="Wijzigingen weggooien?"
						description="Je hebt dingen veranderd die nog niet zijn opgeslagen."
						footer={
							<>
								<Button variant="ghost" onClick={() => blocker().reset?.()}>
									Verder bewerken
								</Button>
								<Button
									variant="danger"
									onClick={() => {
										setInitial(JSON.stringify(draft()));
										blocker().proceed?.();
									}}
								>
									Weggooien
								</Button>
							</>
						}
					/>
				</Show>
			)}
		</RouteDataView>
	);
}
