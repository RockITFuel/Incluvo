import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
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
} from "lucide-solid";
import { createSignal, Show } from "solid-js";
import { AssignmentsPanel } from "../../../../components/admin/assignments-panel";
import { formatDate, kindLabel } from "../../../../components/admin/format";
import {
	CoursesPanel,
	FormsPanel,
} from "../../../../components/admin/templates-panel";
import { UsersPanel } from "../../../../components/admin/users-panel";
import { KPI } from "../../../../components/dashboard/kpi";
import { relativeTime } from "../../../../components/dashboard/plan-status";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { Tabs } from "../../../../components/ui/tabs";
import { Input } from "../../../../components/ui/text-field";
import { toast } from "../../../../components/ui/toast";
import { requireRole } from "../../../../lib/auth/require-role";
import { RequireRole } from "../../../../lib/auth/role-guard";
import { orpc } from "../../../../lib/orpc";
import { friendlyError } from "../../../../lib/errors";

/**
 * School page (superadmin, docs/decisions/superadmin-beheer.md, voorstel 4):
 * one school's stats, its users (invites land in this school), its own form
 * templates and courses, and rename / archive / restore.
 *
 * The server gates every call on `manageTenant`; this guard is UX only.
 */
export const Route = createFileRoute("/_protected/beheer/scholen/$organizationId")({
	beforeLoad: () => requireRole("superadmin"),
	component: () => (
		<RequireRole min="superadmin">
			<SchoolPage />
		</RequireRole>
	),
});

function SchoolPage() {
	const params = Route.useParams();
	const queryClient = useQueryClient();
	const [renameOpen, setRenameOpen] = createSignal(false);
	const [newName, setNewName] = createSignal("");
	const [archiveOpen, setArchiveOpen] = createSignal(false);

	const school = useQuery(() =>
		orpc.admin.organizations.detail.queryOptions({
			input: { id: params().organizationId },
		}),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.admin.organizations.key() });

	const rename = useMutation(() =>
		orpc.admin.organizations.update.mutationOptions({
			onSuccess: () => {
				invalidate();
				setRenameOpen(false);
				toast({ title: "Naam gewijzigd", tone: "success" });
			},
			onError: (error) =>
				toast({ title: "Opslaan mislukt", description: friendlyError(error), tone: "danger" }),
		}),
	);

	const setArchived = useMutation(() =>
		orpc.admin.organizations.setArchived.mutationOptions({
			onSuccess: (org) => {
				invalidate();
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
			},
			onError: (error) =>
				toast({ title: "Mislukt", description: friendlyError(error), tone: "danger" }),
		}),
	);

	const isArchived = () => Boolean(school.data?.archivedAt);
	const isSchool = () => school.data?.kind === "school";

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

			<Show when={school.isLoading}>
				<div class="card text-muted">Laden…</div>
			</Show>
			<Show when={school.error}>
				<div class="card text-danger">Kon deze school niet laden.</div>
			</Show>

			<Show when={school.data}>
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
												? setArchived.mutate({ id: o().id, archived: false })
												: setArchiveOpen(true)
										}
										disabled={setArchived.isPending}
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

						<Tabs
							aria-label="Onderdelen van de school"
							items={[
								{
									value: "users",
									label: "Gebruikers",
									content: (
										<UsersPanel
											organizationId={o().id}
											readOnly={isArchived()}
											defaultInviteRole={
												o().stats.keyuserCount === 0 ? "keyuser" : "leerling"
											}
										/>
									),
								},
								{
									value: "assignments",
									label: "Koppelingen",
									content: (
										<AssignmentsPanel organizationId={o().id} readOnly={isArchived()} />
									),
								},
								{
									value: "forms",
									label: "Formulieren",
									content: <FormsPanel organizationId={o().id} />,
								},
								{
									value: "courses",
									label: "Cursussen",
									content: <CoursesPanel organizationId={o().id} />,
								},
							]}
						/>

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
										disabled={rename.isPending || newName().trim() === ""}
										onClick={() =>
											rename.mutate({ id: o().id, name: newName().trim() })
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
										disabled={setArchived.isPending}
										onClick={() => setArchived.mutate({ id: o().id, archived: true })}
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
			</Show>
		</>
	);
}
