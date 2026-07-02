import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { BookOpen, Compass, FlaskConical, Plus } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Input, Textarea } from "../../../components/ui/text-field";
import { toast } from "../../../components/ui/toast";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Cursussen overzicht (#23) — a 1:1 port of the approved "Cursussen" prototype.
 * A leerling sees their own courses; an ontwikkelaar/keyuser/coach sees the
 * templates + school courses they can build or follow. Ontwikkelaar+ can create
 * a new course here. Each card links to the course view.
 *
 * The card layout is the prototype's; the per-card accent colour and header icon
 * are a deterministic cycle by index (we have no per-course subject colour). The
 * course list endpoint carries no per-leerling voortgang, so cards show no
 * progress — the real percentage is computed on the course view once opened.
 */
export const Route = createFileRoute("/_protected/cursussen/")({
	component: CursussenPage,
});

const kindLabel: Record<string, string> = {
	ondivera_template: "Ondivera-sjabloon",
	school_template: "Schooltemplate",
	student_execution: "Mijn cursus",
};

/** Deterministic accent cycle by card index — the prototype's primary/accent/warning tones. */
const tones = [
	{ bg: "rgb(var(--primary-100))", fg: "rgb(var(--primary))", icon: BookOpen },
	{ bg: "rgb(var(--accent-100))", fg: "rgb(var(--accent-700))", icon: FlaskConical },
	{ bg: "rgb(var(--warning-100))", fg: "rgb(var(--warning))", icon: Compass },
] as const;

function CursussenPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const coursesQuery = useQuery(() => orpc.courses.list.queryOptions({ input: {} }));

	useServerEvent("course.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() }),
	);

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Cursussen</h1>
					<div class="sub">Jouw cursussen, op jouw manier ingesteld.</div>
				</div>
				<div class="ds-row">
					<Show when={(coursesQuery.data?.length ?? 0) > 0}>
						<span class="chip">{coursesQuery.data?.length} actief</span>
					</Show>
					<Show when={me.hasAtLeast("ontwikkelaar")}>
						<CreateCourseDialog />
					</Show>
				</div>
			</div>

			<Show when={coursesQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={coursesQuery.data?.length === 0}>
				<div class="card" style={{ "text-align": "center", color: "rgb(var(--muted))" }}>
					Nog geen cursussen.
				</div>
			</Show>

			<div
				class="ds-grid"
				style={{ "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}
			>
				<For each={coursesQuery.data}>
					{(c, i) => {
						const tone = tones[i() % tones.length]!;
						return (
							<Link
								to="/cursussen/$courseId"
								params={{ courseId: c.id }}
								style={{ "text-decoration": "none", color: "inherit" }}
							>
								<div class="card lift" style={{ padding: "0", overflow: "hidden" }}>
									<div
										style={{
											height: "96px",
											background: tone.bg,
											position: "relative",
											display: "grid",
											"place-items": "center",
										}}
									>
										<tone.icon
											style={{ width: "32px", height: "32px", color: tone.fg }}
											aria-hidden="true"
										/>
										<span
											class="chip"
											style={{
												position: "absolute",
												top: "10px",
												right: "10px",
												background: "rgb(255 255 255 / 0.85)",
											}}
										>
											{kindLabel[c.kind]}
										</span>
									</div>
									<div style={{ padding: "16px" }}>
										<h3 style={{ "font-size": "17px", "margin-bottom": "6px" }}>
											{c.title}
										</h3>
										<div
											style={{
												"font-size": "13px",
												color: "rgb(var(--muted))",
												"margin-bottom": "12px",
												display: "-webkit-box",
												"-webkit-line-clamp": "2",
												"-webkit-box-orient": "vertical",
												overflow: "hidden",
											}}
										>
											<Show
												when={c.description}
												fallback={<>Nog geen omschrijving.</>}
											>
												{c.description}
											</Show>
										</div>
										<div
											class="ds-row ds-between"
											style={{ "font-size": "12px", color: "rgb(var(--muted))" }}
										>
											<span>Bekijk cursus →</span>
										</div>
									</div>
								</div>
							</Link>
						);
					}}
				</For>
			</div>
		</>
	);
}

function CreateCourseDialog() {
	const me = useMe();
	const queryClient = useQueryClient();
	const [open, setOpen] = createSignal(false);
	const [title, setTitle] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [busy, setBusy] = createSignal(false);

	// Ondivera (superadmin) builds platform templates; a school ontwikkelaar
	// builds school templates.
	const kind = () =>
		me.hasAtLeast("superadmin") ? "ondivera_template" : "school_template";

	const create = async () => {
		setBusy(true);
		try {
			await client.courses.create({
				kind: kind(),
				title: title(),
				description: description() || undefined,
			});
			toast({ title: "Cursus aangemaakt", tone: "success" });
			setOpen(false);
			setTitle("");
			setDescription("");
			await queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() });
		} catch (err) {
			toast({
				title: "Aanmaken mislukt",
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
			title="Nieuwe cursus"
			trigger={{
				children: (
					<>
						<Plus class="size-4" aria-hidden="true" /> Nieuwe cursus
					</>
				),
			}}
			footer={
				<>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Annuleren
					</Button>
					<Button onClick={create} disabled={busy() || !title().trim()}>
						{busy() ? "Bezig…" : "Aanmaken"}
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
					label="Omschrijving"
					value={description()}
					onInput={(e) => setDescription(e.currentTarget.value)}
				/>
				<p class="text-micro text-muted">Type: {kindLabel[kind()]}.</p>
			</div>
		</Dialog>
	);
}
