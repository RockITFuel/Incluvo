import { useQuery } from "@tanstack/solid-query";
import { createMemo, For, Show } from "solid-js";
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
export function FormsPanel(props: { organizationId?: string }) {
	const formsQuery = useQuery(() =>
		orpc.admin.templates.forms.queryOptions(),
	);
	// On a school page: only that school's own templates.
	const forms = createMemo(() =>
		(formsQuery.data ?? []).filter(
			(f) => !props.organizationId || f.organizationId === props.organizationId,
		),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Formulieren</h2>
				<p class="mt-1 text-small text-muted">
					Formulier-templates van deze school. Bewerken doe je onder Formulieren.
				</p>
			</div>

			<Show when={formsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={formsQuery.error}>
				<p class="text-danger">Kon formulieren niet laden.</p>
			</Show>
			<Show when={!formsQuery.isLoading && forms().length === 0}>
				<p class="text-muted">Nog geen formulier-templates.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={forms()}>
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

export function CoursesPanel(props: { organizationId?: string }) {
	const coursesQuery = useQuery(() =>
		orpc.admin.templates.courses.queryOptions(),
	);
	const courses = createMemo(() =>
		(coursesQuery.data ?? []).filter(
			(c) => !props.organizationId || c.organizationId === props.organizationId,
		),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">
					{props.organizationId ? "Eigen cursussen van de school" : "Cursussen"}
				</h2>
				<p class="mt-1 text-small text-muted">
					Cursussen en sjablonen van deze school. Bewerken doe je onder Cursussen.
				</p>
			</div>

			<Show when={coursesQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={coursesQuery.error}>
				<p class="text-danger">Kon cursussen niet laden.</p>
			</Show>
			<Show when={!coursesQuery.isLoading && courses().length === 0}>
				<p class="text-muted">Nog geen cursussen.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={courses()}>
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
