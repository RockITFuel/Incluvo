import { INCLUVO_ROLES, type UserRole } from "@incluvo/permissions";
import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { Search } from "lucide-solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Pagination } from "../ui/pagination";
import { Input } from "../ui/text-field";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";
import { roleLabel } from "../shell/nav";
import { useMe } from "../../lib/auth/use-me";
import { orpc } from "../../lib/orpc";
import { friendlyError } from "../../lib/errors";

const PAGE_SIZE = 20;
const ALL_SCHOOLS = "__all__";

/**
 * Gebruikersbeheer (#60). Lists through `admin.users.overview` (tenant-pinned
 * for a keyuser, cross-tenant for the superadmin) and re-uses
 * `account.users.setRole` / `invite` (Epic 1) for the writes.
 *
 * - keyuser: their own school; invites always land there.
 * - superadmin: every school, with a school column + filter, and a required
 *   school choice when inviting (docs/decisions/superadmin-beheer.md).
 * - `organizationId` pins the panel to one school (the school page): no
 *   filter, no school column, invites go into that school.
 */
export function UsersPanel(props: {
	organizationId?: string;
	/** Disable invites, e.g. for an archived school. */
	readOnly?: boolean;
	/** Role the invite dialog opens with (e.g. keyuser for a new school). */
	defaultInviteRole?: UserRole;
}) {
	const me = useMe();
	const queryClient = useQueryClient();
	const [inviteOpen, setInviteOpen] = createSignal(false);
	const [inviteEmail, setInviteEmail] = createSignal("");
	const [inviteName, setInviteName] = createSignal("");
	const [inviteRole, setInviteRole] = createSignal<string>("leerling");
	const [inviteSchool, setInviteSchool] = createSignal<string | undefined>();
	const [schoolFilter, setSchoolFilter] = createSignal(ALL_SCHOOLS);
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);

	/** Superadmin browsing all schools (not pinned to one). */
	const crossTenant = () => me.is("superadmin") && !props.organizationId;

	const scopeId = () =>
		props.organizationId ??
		(crossTenant() && schoolFilter() !== ALL_SCHOOLS
			? schoolFilter()
			: undefined);

	const usersQuery = useQuery(() =>
		orpc.admin.users.overview.queryOptions({
			input: { organizationId: scopeId() },
		}),
	);

	const orgsQuery = useQuery(() => ({
		...orpc.admin.organizations.listAll.queryOptions(),
		enabled: crossTenant(),
	}));
	const schoolOptions = createMemo(() =>
		(orgsQuery.data ?? [])
			.filter((o) => !o.archivedAt)
			.map((o) => ({ value: o.id, label: o.name })),
	);

	const filtered = createMemo(() => {
		const q = search().trim().toLowerCase();
		const rows = usersQuery.data ?? [];
		if (!q) return rows;
		return rows.filter(
			(u) =>
				u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
		);
	});
	createEffect(on([search, schoolFilter], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() =>
		Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)),
	);
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	// A keyuser may not grant superadmin; the superadmin may grant anything.
	const roleOptions = () =>
		(me.is("superadmin")
			? INCLUVO_ROLES
			: INCLUVO_ROLES.filter((r) => r !== "superadmin")
		).map((r) => ({ value: r, label: roleLabel(r) }));

	/** Where an invite lands: the pinned school, the chosen one, or own school. */
	const inviteTarget = () =>
		props.organizationId ?? (crossTenant() ? inviteSchool() : undefined);

	const openInvite = () => {
		// Pre-select the school the superadmin is filtering on.
		setInviteSchool(
			schoolFilter() !== ALL_SCHOOLS ? schoolFilter() : undefined,
		);
		setInviteRole(props.defaultInviteRole ?? "leerling");
		setInviteOpen(true);
	};

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() });
		queryClient.invalidateQueries({
			queryKey: orpc.admin.organizations.key(),
		});
	};

	const setRole = useMutation(() =>
		orpc.account.users.setRole.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast({ title: "Rol bijgewerkt", tone: "success" });
			},
			onError: () =>
				toast({ title: "Kon rol niet wijzigen", tone: "danger" }),
		}),
	);

	const invite = useMutation(() =>
		orpc.account.users.invite.mutationOptions({
			onSuccess: (res) => {
				invalidate();
				setInviteOpen(false);
				setInviteEmail("");
				setInviteName("");
				toast(
					res.mailSent
						? {
								title: res.created ? "Gebruiker uitgenodigd" : "Gebruiker bijgewerkt",
								description: `${res.email} krijgt een e-mail om een wachtwoord te kiezen.`,
								tone: "success",
							}
						: {
								title: "Account aangemaakt, e-mail niet verstuurd",
								description: "Probeer het later opnieuw via Uitnodigen.",
								tone: "warning",
							},
				);
			},
			onError: (error) =>
				toast({
					title: "Uitnodigen mislukt",
					description: friendlyError(error),
					tone: "danger",
				}),
		}),
	);

	const canInvite = () =>
		!invite.isPending &&
		inviteEmail().includes("@") &&
		(!crossTenant() || inviteSchool() !== undefined);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Gebruikers</h2>
					<p class="mt-1 text-small text-muted">
						<Show
							when={crossTenant()}
							fallback={
								<Show
									when={!props.organizationId}
									fallback="Gebruikers en rollen van deze school."
								>
									Beheer gebruikers en rollen binnen{" "}
									<strong class="text-ink-2">
										{me.organization()?.name ?? "jouw organisatie"}
									</strong>
									.
								</Show>
							}
						>
							Gebruikers van alle scholen. Filter op school of zoek op naam.
						</Show>
					</p>
				</div>
				<Show when={!props.readOnly}>
					<Button onClick={openInvite}>Gebruiker uitnodigen</Button>
				</Show>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<Show when={crossTenant()}>
					<Select
						aria-label="Filter op school"
						options={[
							{ value: ALL_SCHOOLS, label: "Alle scholen" },
							...(orgsQuery.data ?? []).map((o) => ({
								value: o.id,
								label: o.archivedAt ? `${o.name} (gearchiveerd)` : o.name,
							})),
						]}
						value={schoolFilter()}
						onChange={(v) => setSchoolFilter(v ?? ALL_SCHOOLS)}
						triggerClass="min-w-52"
					/>
				</Show>
				<label class="flex min-w-60 flex-1 items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2 sm:max-w-80">
					<Search class="size-3.5 text-muted" aria-hidden="true" />
					<input
						value={search()}
						onInput={(e) => setSearch(e.currentTarget.value)}
						class="w-full bg-transparent text-small text-ink outline-none"
						placeholder="Zoek op naam of e-mail…"
						aria-label="Zoek gebruiker"
					/>
				</label>
			</div>

			<Show when={usersQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={usersQuery.error}>
				<p class="text-danger">Kon gebruikers niet laden.</p>
			</Show>

			<Show when={filtered().length > 0}>
				<Card padding="none" class="overflow-hidden">
					<ul>
						<For each={paged()}>
							{(u) => (
								<li class="flex flex-wrap items-center justify-between gap-3 border-line-2 border-b px-4 py-3 last:border-b-0">
									<div class="min-w-0">
										<p class="font-medium text-ink">{u.name}</p>
										<p class="truncate text-small text-muted">{u.email}</p>
									</div>
									<div class="flex flex-wrap items-center gap-3">
										<Show when={crossTenant()}>
											<Badge variant="neutral">
												{u.organizationName ?? "Geen school"}
											</Badge>
										</Show>
										<Select
											aria-label={`Rol voor ${u.name}`}
											options={roleOptions()}
											value={
												roleOptions().some((o) => o.value === u.role)
													? u.role
													: undefined
											}
											placeholder={roleLabel(u.role as UserRole)}
											disabled={setRole.isPending || props.readOnly}
											triggerClass="min-w-40"
											onChange={(value) => {
												if (value && value !== u.role) {
													setRole.mutate({
														userId: u.id,
														role: value as never,
													});
												}
											}}
										/>
									</div>
								</li>
							)}
						</For>
					</ul>
					<Pagination
						page={currentPage()}
						pageCount={pageCount()}
						pageSize={PAGE_SIZE}
						total={filtered().length}
						noun="gebruikers"
						onPage={setPage}
					/>
				</Card>
			</Show>

			<Show when={!usersQuery.isLoading && filtered().length === 0}>
				<p class="text-muted">
					{search() ? "Geen gebruikers gevonden." : "Nog geen gebruikers."}
				</p>
			</Show>

			<Dialog
				open={inviteOpen()}
				onOpenChange={setInviteOpen}
				title="Gebruiker uitnodigen"
				description="De gebruiker krijgt een e-mail met een link om een wachtwoord te kiezen."
				footer={
					<>
						<Button
							variant="subtle"
							onClick={() => setInviteOpen(false)}
						>
							Annuleren
						</Button>
						<Button
							disabled={!canInvite()}
							onClick={() =>
								invite.mutate({
									email: inviteEmail(),
									name: inviteName().trim() || undefined,
									role: inviteRole() as never,
									organizationId: inviteTarget(),
								})
							}
						>
							Uitnodigen
						</Button>
					</>
				}
			>
				<div class="flex flex-col gap-4">
					<Show when={crossTenant()}>
						<Select
							label="School"
							placeholder="Kies een school"
							options={schoolOptions()}
							value={inviteSchool()}
							onChange={setInviteSchool}
							triggerClass="min-w-40"
						/>
					</Show>
					<Input
						label="E-mailadres"
						type="email"
						required
						placeholder="naam@school.nl"
						value={inviteEmail()}
						onInput={(e) => setInviteEmail(e.currentTarget.value)}
					/>
					<Input
						label="Naam"
						placeholder="Voor- en achternaam"
						value={inviteName()}
						onInput={(e) => setInviteName(e.currentTarget.value)}
					/>
					<Select
						label="Rol"
						options={roleOptions()}
						value={inviteRole()}
						onChange={(v) => v && setInviteRole(v)}
						triggerClass="min-w-40"
					/>
				</div>
			</Dialog>
		</section>
	);
}
