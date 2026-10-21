import { createSignal } from "solid-js";
import { Button } from "../ui/button";
import { CreateSchoolDialog } from "./create-school-dialog";
import { SchoolsTable } from "./schools-table";
import type { OrganizationRow } from "./users-panel";

/**
 * Scholen (#60) — superadmin only. The same filterable, paginated schools
 * table as the platform overview; a row opens the school page, where rename,
 * archive, users, koppelingen and courses live.
 */
export function SchoolsPanel(props: { orgs: OrganizationRow[] }) {
	const [createOpen, setCreateOpen] = createSignal(false);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Scholen</h2>
					<p class="mt-1 text-small text-muted">
						Alle aangesloten scholen. Open een school om gebruikers uit te nodigen,
						cursussen beschikbaar te maken of de school te archiveren.
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>Nieuwe school</Button>
			</div>

			<SchoolsTable orgs={props.orgs} />

			<CreateSchoolDialog open={createOpen()} onOpenChange={setCreateOpen} />
		</section>
	);
}
