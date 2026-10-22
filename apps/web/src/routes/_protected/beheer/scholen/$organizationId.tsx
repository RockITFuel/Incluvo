import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import {
	Archive,
	ArchiveRestore,
	ArrowLeft,
	BookOpen,
	GraduationCap,
	KeyRound,
	NotebookPen,
	Pencil,
	Users,
} from "../../../../lib/icons";
import { createMemo, createSignal, Show } from "solid-js";
import { AssignmentsPanel } from "../../../../components/admin/assignments-panel";
import { formatDate, kindLabel } from "../../../../components/admin/format";
import { SchoolCoursesPanel } from "../../../../components/admin/school-courses-panel";
import { FormsPanel } from "../../../../components/admin/templates-panel";
import { UsersPanel } from "../../../../components/admin/users-panel";
import { KPI } from "../../../../components/dashboard/kpi";
import { relativeTime } from "../../../../components/dashboard/plan-status";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { Tabs } from "../../../../components/ui/tabs";
import { Input } from "../../../../components/ui/text-field";
import { toast } from "../../../../components/ui/toast";
import { RouteDataView } from "../../../../components/ui/route-data-view";
import { createAction } from "../../../../lib/action";
import { requireRole } from "../../../../lib/auth/role-guard";
import { client } from "../../../../lib/orpc";
import { refresh } from "../../../../lib/refresh";
import { loadRouteData } from "../../../../lib/route-data";

/**
 * School page (superadmin, docs/decisions/superadmin-beheer.md, voorstel 4):
 * one school's stats, its users (invites land in this school), its own form
 * templates and courses, and rename / archive / restore.
 *
 * The server gates every call on `manageTenant`; this guard is UX only.
 *
 * The loader fetches the school and its users; the koppelingen, forms and
 * courses panels page on their own.
 */
export const Route = createFileRoute("/_protected/beheer/scholen/$organizationId")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "superadmin" }),
	loader: async ({ params, abortController }) => {
		const signal = abortController.signal;
		const id = params.organizationId;
		const [school, users] = await Promise.all([
			loadRouteData(signal, (s) => client.admin.organizations.detail({ id }, { signal: s })),
			loadRouteData(signal, (s) =>
				client.admin.users.overview({ organizationId: id }, { signal: s }),
			),
		]);
		return { school, users };
	},
	component: SchoolPage,
});

function SchoolPage() {
	const router = useRouter();
	const params = Route.useParams();
	const data = Route.useLoaderData();
	const [renameOpen, setRenameOpen] = createSignal(false);
	const [newName, setNewName] = createSignal("");
	const [archiveOpen, setArchiveOpen] = createSignal(false);
	const retry = () => void refresh(router, "admin");

	const school = () => {
		const result = data().school;
		return result.access === "granted" ? result.value : undefined;
	};

	const rename = createAction(
		async (input: { id: string; name: string }) => {
			await client.admin.organizations.update(input);
			setRenameOpen(false);
			toast({ title: "Naam gewijzigd", tone: "success" });
			await refresh(router, "admin");
		},
		{ error: "Opslaan mislukt" },
	);

	const setArchived = createAction(
		async (input: { id: string; archived: boolean }) => {
			const org = await client.admin.organizations.setArchived(input);
			setArchiveOpen(false);
			toast(
				org.archivedAt
					? {
							title: "School gearchiveerd",
							description: "Gebruikers van deze school zijn uitgelogd.",
							tone: "success",
						}
					: { title: "School hersteld", tone: "success" },
			);
			await refresh(router, "admin");
		},
		{ error: "Mislukt" },
	);

	const isArchived = () => Boolean(school()?.archivedAt);
	const isSchool = () => school()?.kind === "school";

	// Built once per school: the panels read the loader data through getters,
	// so a refresh updates them in place instead of rebuilding them.
	const tabs = createMemo(() => {
		const id = params().organizationId;
		return [
			{
				value: "users",
				label: "Gebruikers",
				content: (
					<RouteDataView data={data().users} what="de gebruikers" onRetry={retry}>
						{(users) => (
							<UsersPanel
								users={users()}
								organizationId={id}
								readOnly={isArchived()}
								defaultInviteRole={school()?.stats.keyuserCount === 0 ? "keyuser" : "leerling"}
							/>
						)}
					</RouteDataView>
				),
			},
			{
				value: "assignments",
				label: "Koppelingen",
				content: <AssignmentsPanel organizationId={id} readOnly={isArchived()} />,
			},
			{
				value: "forms",
				label: "Formulieren",
				content: <FormsPanel organizationId={id} />,
			},
			{
				value: "courses",
				label: "Cursussen",
				content: <SchoolCoursesPanel organizationId={id} readOnly={isArchived()} />,
			},
		];
	});

	return (
		<>
			<Link
				to="/dashboard"
				class="ds-row"
				style={{
					gap: "6px",
					"font-size": "0.8125rem",
					color: "rgb(var(--muted))",
					"margin-bottom": "12px",
					width: "fit-content",
				}}
			>
				<ArrowLeft class="size-3.5" aria-hidden="true" /> Alle scholen
			</Link>

			<RouteDataView data={data().school} what="deze school" onRetry={retry}>
				{(o) => (
					<>
						<div class="page-head">
							<div>
								<div class="ds-row" style={{ gap: "10px", "flex-wrap": "wrap" }}>
									<h1>{o().name}</h1>
									<Badge variant={o().kind === "ondivera" ? "accent" : "primary"}>
										{kindLabel(o().kind)}
									</Badge>
									<Show when={isArchived()}>
										<Badge variant="neutral">Gearchiveerd</Badge>
									</Show>
								</div>
								<div class="sub">
									Aangemaakt {formatDate(o().createdAt)} · laatst actief{" "}
									{o().stats.lastActiveAt
										? relativeTime(o().stats.lastActiveAt)
										: "nog nooit"}
								</div>
							</div>
							<div class="ds-row">
								<Show when={!isArchived()}>
									<button
										type="button"
										class="btn ghost"
										onClick={() => {
											setNewName(o().name);
											setRenameOpen(true);
										}}
									>
										<Pencil class="size-3.5" aria-hidden="true" /> Naam wijzigen
									</button>
								</Show>
								<Show when={isSchool()}>
									<button
										type="button"
										class="btn ghost"
										onClick={() =>
											isArchived()
												? void setArchived.run({ id: o().id, archived: false })
												: setArchiveOpen(true)
										}
										disabled={setArchived.pending()}
									>
										<Show
											when={isArchived()}
											fallback={
												<>
													<Archive class="size-3.5" aria-hidden="true" /> Archiveren
												</>
											}
										>
											<ArchiveRestore class="size-3.5" aria-hidden="true" /> Herstellen
										</Show>
									</button>
								</Show>
							</div>
						</div>

						<Show when={isArchived()}>
							<div
								class="card"
								role="status"
								style={{
									"margin-bottom": "20px",
									background: "rgb(var(--bg-2))",
									"font-size": "0.875rem",
								}}
							>
								Deze school is gearchiveerd op {formatDate(o().archivedAt)}. Gebruikers
								kunnen niet inloggen en er kunnen geen nieuwe gebruikers worden
								uitgenodigd. Alle gegevens zijn bewaard; met Herstellen werkt alles
								weer.
							</div>
						</Show>

						<Show when={isSchool() && !isArchived() && o().stats.keyuserCount === 0}>
							<div
								class="card"
								role="status"
								style={{
									"margin-bottom": "20px",
									background: "rgb(var(--warning-100))",
									"font-size": "0.875rem",
								}}
							>
								<strong>Volgende stap:</strong> deze school heeft nog geen keyuser.
								Nodig hieronder de keyuser uit; die beheert daarna zelf de coaches
								en leerlingen.
							</div>
						</Show>

						<div class="ds-grid-tiles" style={{ "margin-bottom": "24px" }}>
							<KPI
								label="Keyusers"
								value={String(o().stats.keyuserCount)}
								sub={`${o().stats.userCount} ${o().stats.userCount === 1 ? "gebruiker" : "gebruikers"} in totaal`}
								tone="primary"
								icon={KeyRound}
							/>
							<KPI
								label="Coaches"
								value={String(o().stats.coachCount)}
								sub={`${o().stats.plansWaiting} plannen wachten op beoordeling`}
								tone="accent"
								icon={Users}
							/>
							<KPI
								label="Leerlingen"
								value={String(o().stats.leerlingCount)}
								sub="in deze school"
								tone="success"
								icon={GraduationCap}
							/>
							<KPI
								label="Templates"
								value={String(o().stats.formTemplateCount + o().stats.courseCount)}
								sub={`${o().stats.formTemplateCount} formulieren · ${o().stats.courseCount} cursussen`}
								tone="warning"
								icon={o().stats.courseCount > 0 ? BookOpen : NotebookPen}
							/>
						</div>

						<Tabs aria-label="Onderdelen van de school" items={tabs()} />

						<Dialog
							open={renameOpen()}
							onOpenChange={setRenameOpen}
							title="Naam wijzigen"
							footer={
								<>
									<Button variant="subtle" onClick={() => setRenameOpen(false)}>
										Annuleren
									</Button>
									<Button
										disabled={rename.pending() || newName().trim() === ""}
										onClick={() =>
											void rename.run({ id: o().id, name: newName().trim() })
										}
									>
										Opslaan
									</Button>
								</>
							}
						>
							<Input
								label="Naam"
								required
								value={newName()}
								onInput={(e) => setNewName(e.currentTarget.value)}
							/>
						</Dialog>

						<Dialog
							open={archiveOpen()}
							onOpenChange={setArchiveOpen}
							title={`${o().name} archiveren?`}
							description="Alle gebruikers van deze school worden direct uitgelogd en kunnen niet meer inloggen. Er kunnen geen nieuwe gebruikers worden uitgenodigd. De gegevens blijven bewaard en je kunt de school later herstellen."
							footer={
								<>
									<Button variant="subtle" onClick={() => setArchiveOpen(false)}>
										Annuleren
									</Button>
									<Button
										variant="danger"
										disabled={setArchived.pending()}
										onClick={() => void setArchived.run({ id: o().id, archived: true })}
									>
										Archiveren
									</Button>
								</>
							}
						>
							<p class="text-small text-muted">
								Dit raakt {o().stats.userCount}{" "}
								{o().stats.userCount === 1 ? "gebruiker" : "gebruikers"}, waarvan{" "}
								{o().stats.leerlingCount}{" "}
								{o().stats.leerlingCount === 1 ? "leerling" : "leerlingen"}.
							</p>
						</Dialog>
					</>
				)}
			</RouteDataView>
		</>
	);
}
