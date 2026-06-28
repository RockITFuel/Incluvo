import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { GraduationCap, Plus } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog } from "../../../components/ui/dialog";
import { Input, Textarea } from "../../../components/ui/text-field";
import { toast } from "../../../components/ui/toast";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Cursussen overzicht (#23). A leerling sees their own courses; an ontwikkelaar/
 * keyuser/coach sees the templates + school courses they can build or follow.
 * Ontwikkelaar+ can create a new course here. Each card links to the course view.
 */
export const Route = createFileRoute("/_protected/cursussen/")({
	component: CursussenPage,
});

const kindLabel: Record<string, string> = {
	ondivera_template: "Ondivera-sjabloon",
	school_template: "Schooltemplate",
	student_execution: "Mijn cursus",
};

function CursussenPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const coursesQuery = useQuery(() => orpc.courses.list.queryOptions({ input: {} }));

	useServerEvent("course.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() }),
	);

	return (
		<section class="flex flex-col gap-6">
			<div class="flex items-end justify-between gap-4">
				<div>
					<h1 class="font-head text-h1 text-ink">Cursussen</h1>
					<p class="mt-1 text-body text-muted">
						Jouw cursussen, op jouw manier ingesteld.
					</p>
				</div>
				<Show when={me.hasAtLeast("ontwikkelaar")}>
					<CreateCourseDialog />
				</Show>
			</div>

			<Show when={coursesQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={coursesQuery.data?.length === 0}>
				<Card class="text-center text-muted">Nog geen cursussen.</Card>
			</Show>

			<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
				<For each={coursesQuery.data}>
					{(c) => (
						<Link to="/cursussen/$courseId" params={{ courseId: c.id }}>
							<Card padding="none" elevation="low" class="overflow-hidden">
								<div class="grid h-24 place-items-center bg-primary-100">
									<GraduationCap class="size-8 text-primary" />
								</div>
								<div class="flex flex-col gap-2 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="font-medium text-ink">{c.title}</h3>
										<Badge variant="outline">{kindLabel[c.kind]}</Badge>
									</div>
									<Show when={c.description}>
										<p class="line-clamp-2 text-small text-muted">
											{c.description}
										</p>
									</Show>
								</div>
							</Card>
						</Link>
					)}
				</For>
			</div>
		</section>
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
			trigger={
				<Button>
					<Plus class="size-4" /> Nieuwe cursus
				</Button>
			}
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
				<p class="text-micro text-muted">
					Type: {kindLabel[kind()]}.
				</p>
			</div>
		</Dialog>
	);
}
