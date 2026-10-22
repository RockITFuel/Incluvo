import { rolesCombine, type UserRole } from "@incluvo/permissions";
import { createSignal, For, Show } from "solid-js";
import { roleLabel } from "../shell/nav";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Switch } from "../ui/switch";

/**
 * Give one person several roles (INC-24), e.g. keyuser and coach. A leerling
 * or superadmin role stands alone: switching it on turns the others off, and a
 * school role turns it off again.
 */
export function RolesDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	roles: UserRole[];
	/** The roles this keyuser or superadmin may hand out. */
	options: UserRole[];
	saving: boolean;
	onSave: (roles: UserRole[]) => void;
}) {
	// Starts from the person's roles each time the dialog opens.
	const [chosen, setChosen] = createSignal<UserRole[]>(() =>
		props.open ? [...props.roles] : [],
	);

	const toggle = (role: UserRole, on: boolean) => {
		if (!on) return setChosen(chosen().filter((r) => r !== role));
		const next = [...chosen(), role];
		setChosen(rolesCombine(next) ? next : [role]);
	};
	const ordered = () => props.options.filter((r) => chosen().includes(r));

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title={`Rollen van ${props.name}`}
			description="Met meerdere rollen wisselt iemand zelf van rol via het menu met de naam. Een leerling of superadmin heeft alleen die rol."
			footer={
				<>
					<Button variant="subtle" onClick={() => props.onOpenChange(false)}>
						Annuleren
					</Button>
					<Button
						disabled={props.saving || ordered().length === 0}
						onClick={() => props.onSave(ordered())}
					>
						{props.saving ? "Opslaan…" : "Opslaan"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-3">
				<For each={props.options}>
					{(role) => (
						<Switch
							label={roleLabel(role)}
							checked={chosen().includes(role)}
							onChange={(on) => toggle(role, on)}
						/>
					)}
				</For>
				<Show when={ordered().length === 0}>
					<p class="text-small text-danger" role="alert">
						Kies minstens één rol.
					</p>
				</Show>
			</div>
		</Dialog>
	);
}
