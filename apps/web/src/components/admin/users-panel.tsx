import { INCLUVO_ROLES } from "@incluvo/permissions";
import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";
import { useMe } from "../../lib/auth/use-me";
import { orpc } from "../../lib/orpc";

/**
 * Gebruikersbeheer (#60). Re-uses `account.users.listInTenant` / `setRole` /
 * `invite` (Epic 1) so the admin omgeving doesn't duplicate user CRUD. A keyuser
 * manages their own tenant; the superadmin sees their own tenant here too and
 * the cross-tenant overview in the Scholen tab.
 */
export function UsersPanel() {
	const me = useMe();
	const queryClient = useQueryClient();
	const [inviteOpen, setInviteOpen] = createSignal(false);
	const [inviteEmail, setInviteEmail] = createSignal("");
	const [inviteRole, setInviteRole] = createSignal<string>("leerling");

	const usersQuery = useQuery(() =>
		orpc.account.users.listInTenant.queryOptions(),
	);

	// A keyuser may not grant superadmin; the superadmin may grant anything.
	const roleOptions = () =>
		(me.is("superadmin")
			? INCLUVO_ROLES
			: INCLUVO_ROLES.filter((r) => r !== "superadmin")
		).map((r) => ({ value: r, label: r }));

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.account.users.listInTenant.key(),
		});

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
			onSuccess: () => {
				invalidate();
				setInviteOpen(false);
				setInviteEmail("");
				toast({ title: "Gebruiker uitgenodigd", tone: "success" });
			},
			onError: () =>
				toast({ title: "Uitnodigen mislukt", tone: "danger" }),
		}),
	);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Gebruikers</h2>
					<p class="mt-1 text-small text-muted">
						Beheer gebruikers en rollen binnen{" "}
						<strong class="text-ink-2">
							{me.organization()?.name ?? "jouw organisatie"}
						</strong>
						.
					</p>
				</div>
				<Button onClick={() => setInviteOpen(true)}>
					Gebruiker uitnodigen
				</Button>
			</div>

			<Show when={usersQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={usersQuery.error}>
				<p class="text-danger">Kon gebruikers niet laden.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={usersQuery.data}>
					{(u) => (
						<li>
							<Card
								padding="sm"
								class="flex flex-wrap items-center justify-between gap-3"
							>
								<div class="min-w-0">
									<p class="font-medium text-ink">{u.name}</p>
									<p class="text-small text-muted">{u.email}</p>
								</div>
								<div class="flex items-center gap-3">
									<Badge variant="primary">{u.role}</Badge>
									<Select
										aria-label={`Rol voor ${u.name}`}
										options={roleOptions()}
										value={
											roleOptions().some((o) => o.value === u.role)
												? u.role
												: undefined
										}
										placeholder="Rol kiezen"
										disabled={setRole.isPending}
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
							</Card>
						</li>
					)}
				</For>
			</ul>

			<Show when={!usersQuery.isLoading && usersQuery.data?.length === 0}>
				<p class="text-muted">Nog geen gebruikers in deze tenant.</p>
			</Show>

			<Dialog
				open={inviteOpen()}
				onOpenChange={setInviteOpen}
				title="Gebruiker uitnodigen"
				description="Voeg een gebruiker toe aan jouw organisatie met een rol."
				footer={
					<>
						<Button
							variant="subtle"
							onClick={() => setInviteOpen(false)}
						>
							Annuleren
						</Button>
						<Button
							disabled={invite.isPending || !inviteEmail().includes("@")}
							onClick={() =>
								invite.mutate({
									email: inviteEmail(),
									role: inviteRole() as never,
								})
							}
						>
							Uitnodigen
						</Button>
					</>
				}
			>
				<div class="flex flex-col gap-4">
					<Input
						label="E-mailadres"
						type="email"
						required
						placeholder="naam@school.nl"
						value={inviteEmail()}
						onInput={(e) => setInviteEmail(e.currentTarget.value)}
					/>
					<div class="flex flex-col gap-1.5">
						<span class="text-small font-medium text-ink-2">Rol</span>
						<Select
							aria-label="Rol"
							options={roleOptions()}
							value={inviteRole()}
							onChange={(v) => v && setInviteRole(v)}
							triggerClass="min-w-40"
						/>
					</div>
				</div>
			</Dialog>
		</section>
	);
}
