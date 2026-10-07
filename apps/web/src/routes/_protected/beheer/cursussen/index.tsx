import { createFileRoute } from "@tanstack/solid-router";
import { CourseCatalog } from "../../../../components/admin/course-catalog";
import { requireRole } from "../../../../lib/auth/require-role";
import { RequireRole } from "../../../../lib/auth/role-guard";

/**
 * Cursuscatalogus for Ondivera (docs/decisions/cursuscatalogus.md). Schools
 * use /cursussen; this page manages which Ondivera course each school may use
 * and the categories to filter on.
 */
export const Route = createFileRoute("/_protected/beheer/cursussen/")({
	beforeLoad: () => requireRole("superadmin"),
	component: () => (
		<RequireRole min="superadmin">
			<CourseCatalog />
		</RequireRole>
	),
});
