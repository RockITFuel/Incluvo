import { policies } from "@incluvo/permissions";
import { can } from "@incluvo/permissions";
import type { UserRole } from "@incluvo/permissions";
import { createFileRoute } from "@tanstack/solid-router";
import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { toast } from "../../components/ui/toast";
import { orpc } from "../../lib/orpc";
import { useServerEvent } from "../../lib/sse/use-events";

/**
 * ⚠️ DEMO ROUTE — NOT PART OF THE PRODUCT.
 *
 * This is the original vertical-slice example (CRUD + SSE + RBAC). It is kept
 * only as a living reference for `useServerEvent` and the oRPC/permissions wiring
 * and is intentionally NOT linked from the role-aware app navigation. Do not ship
 * links to it in product surfaces; remove this file once the example is no longer
 * needed.
 */
export const Route = createFileRoute("/_protected/items")({
	component: ItemsPage,
});

function ItemsPage() {
	const ctx = Route.useRouteContext();
	const queryClient = useQueryClient();
	const [title, setTitle] = createSignal("");

	const actor = () => {
		const user = ctx().user as { id: string; role?: string } | undefined;
		return user
			? { userId: user.id, role: (user.role ?? "member") as UserRole }
			: null;
	};

	const itemsQuery = useQuery(() => orpc.items.list.queryOptions());

	// Refetch when another client mutates an item.
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.items.list.key() });
	useServerEvent("item.created", invalidate);
	useServerEvent("item.updated", invalidate);
	useServerEvent("item.deleted", invalidate);

	const createItem = useMutation(() =>
		orpc.items.create.mutationOptions({
			onSuccess: () => {
				setTitle("");
				invalidate();
				toast({ title: "Item toegevoegd", tone: "success" });
			},
		}),
	);

	const canCreate = () => {
		const a = actor();
		return a ? can(a, policies.createItems) : false;
	};

	return (
		<section class="flex flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Items</h1>
				<p class="mt-1 text-body text-muted">
					Voorbeeld-vertical-slice, opnieuw vormgegeven met de UI-kit.
				</p>
			</div>

			<Show when={canCreate()}>
				<form
					class="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (title().trim()) createItem.mutate({ title: title().trim() });
					}}
				>
					<input
						class="flex-1 rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						placeholder="Nieuw item…"
						aria-label="Nieuw item"
						value={title()}
						onInput={(e) => setTitle(e.currentTarget.value)}
					/>
					<Button type="submit" disabled={createItem.isPending}>
						Toevoegen
					</Button>
				</form>
			</Show>

			<Show when={itemsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={itemsQuery.error}>
				<p class="text-danger">Kon items niet laden.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={itemsQuery.data}>
					{(it) => (
						<li>
							<Card
								padding="sm"
								class="flex items-center justify-between gap-3"
							>
								<div class="min-w-0">
									<p class="font-medium text-ink">{it.title}</p>
									<Show when={it.description}>
										<p class="text-small text-muted">{it.description}</p>
									</Show>
								</div>
								<Badge variant="primary">{it.status}</Badge>
							</Card>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}
