import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useRouter } from "@tanstack/solid-router";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-solid";
import { Show } from "solid-js";
import { authClient } from "../../lib/auth/auth-client";
import { Avatar } from "../ui/avatar";

export type ShellUser = {
	name: string;
	subtitle?: string;
	/** Tenant (organization) name shown in the shell user area. */
	organization?: string;
	/** Human-readable role label (e.g. "Coach"). */
	roleLabel?: string;
	tone?: "leerling" | "coach";
};

const itemClass =
	"flex cursor-pointer items-center gap-2 rounded-1 px-3 py-2 text-small text-ink-2 outline-none data-[highlighted]:bg-line-2 data-[highlighted]:text-ink";

/** Avatar + name button that opens an accessible dropdown with sign-out. */
export function UserMenu(props: { user: ShellUser }) {
	const router = useRouter();

	async function signOut() {
		await authClient.signOut();
		router.navigate({ to: "/login" });
	}

	return (
		<DropdownMenu placement="bottom-end" gutter={8}>
			<DropdownMenu.Trigger class="flex items-center gap-2 rounded-2 border border-line bg-surface px-2 py-1.5 text-left transition-colors duration-fast hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<Avatar name={props.user.name} tone={props.user.tone} size="sm" />
				<span class="hidden min-w-0 flex-col sm:flex">
					<span class="truncate text-small font-medium text-ink">
						{props.user.name}
					</span>
					<Show when={props.user.roleLabel || props.user.organization}>
						<span class="truncate text-micro text-muted">
							{[props.user.roleLabel, props.user.organization]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</Show>
				</span>
				<ChevronDown class="size-4 text-muted" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class="z-[90] w-56 rounded-2 border border-line bg-surface p-1 shadow-3 outline-none animate-scale-in">
					<div class="flex items-center gap-2 px-2 py-2">
						<Avatar name={props.user.name} tone={props.user.tone} size="md" />
						<div class="min-w-0">
							<div class="truncate text-small font-medium text-ink">
								{props.user.name}
							</div>
							<div class="truncate text-micro text-muted">
								{props.user.subtitle}
							</div>
							<Show when={props.user.roleLabel || props.user.organization}>
								<div class="truncate text-micro text-muted">
									{[props.user.roleLabel, props.user.organization]
										.filter(Boolean)
										.join(" · ")}
								</div>
							</Show>
						</div>
					</div>
					<DropdownMenu.Separator class="my-1 border-line-2 border-t" />
					<DropdownMenu.Item class={itemClass} closeOnSelect>
						<UserIcon class="size-4" /> Mijn profiel
					</DropdownMenu.Item>
					<DropdownMenu.Item class={itemClass} onSelect={signOut}>
						<LogOut class="size-4" /> Uitloggen
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu>
	);
}
