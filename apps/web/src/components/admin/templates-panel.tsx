import { useQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { orpc } from "../../lib/orpc";
import { formatDate } from "./format";

const FORM_SCOPE_LABEL: Record<string, string> = {
	ondivera: "Ondivera-sjabloon",
	school: "Schooltemplate",
};

const COURSE_KIND_LABEL: Record<string, string> = {
	ondivera_template: "Ondivera-sjabloon",
	school_template: "Schooltemplate",
	student_execution: "Leerling-uitvoering",
};

/**
 * Templates-overzicht (#60). Read-only list of form templates (#8/#9) and
 * courses (#23) the admin can see. Superadmin sees everything; keyuser sees
 * Ondivera platform templates + their own school's items.
 */
export function FormsPanel() {
	const formsQuery = useQuery(() =>
		orpc.admin.templates.forms.queryOptions(),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Formulieren</h2>
				<p class="mt-1 text-small text-muted">
					Overzicht van formulier-templates (coachplan, #8/#9). Alleen-lezen.
				</p>
			</div>

			<Show when={formsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={formsQuery.error}>
				<p class="text-danger">Kon formulieren niet laden.</p>
			</Show>
			<Show when={!formsQuery.isLoading && formsQuery.data?.length === 0}>
				<p class="text-muted">Nog geen formulier-templates.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={formsQuery.data}>
					{(f) => (
						<li>
							<Card
								padding="sm"
								class="flex flex-wrap items-center justify-between gap-3"
							>
								<div class="min-w-0">
									<p class="font-medium text-ink">{f.name}</p>
									<p class="text-micro text-muted">
										Aangemaakt {formatDate(f.createdAt)}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<Show when={f.isSchoolDefault}>
										<Badge variant="success">Standaard</Badge>
									</Show>
									<Badge
										variant={f.scope === "ondivera" ? "accent" : "primary"}
									>
										{FORM_SCOPE_LABEL[f.scope] ?? f.scope}
									</Badge>
								</div>
							</Card>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}

export function CoursesPanel() {
	const coursesQuery = useQuery(() =>
		orpc.admin.templates.courses.queryOptions(),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Cursussen</h2>
				<p class="mt-1 text-small text-muted">
					Overzicht van cursussen en sjablonen (#23). Alleen-lezen.
				</p>
			</div>

			<Show when={coursesQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={coursesQuery.error}>
				<p class="text-danger">Kon cursussen niet laden.</p>
			</Show>
			<Show when={!coursesQuery.isLoading && coursesQuery.data?.length === 0}>
				<p class="text-muted">Nog geen cursussen.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={coursesQuery.data}>
					{(c) => (
						<li>
							<Card
								padding="sm"
								class="flex flex-wrap items-center justify-between gap-3"
							>
								<div class="min-w-0">
									<p class="font-medium text-ink">{c.title}</p>
									<p class="text-micro text-muted">
										Aangemaakt {formatDate(c.createdAt)}
									</p>
								</div>
								<Badge
									variant={
										c.kind === "ondivera_template"
											? "accent"
											: c.kind === "school_template"
												? "primary"
												: "neutral"
									}
								>
									{COURSE_KIND_LABEL[c.kind] ?? c.kind}
								</Badge>
							</Card>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}
