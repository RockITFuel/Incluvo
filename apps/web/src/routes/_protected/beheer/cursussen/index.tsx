import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { CourseCatalog } from "../../../../components/admin/course-catalog";
import { RouteDataView } from "../../../../components/ui/route-data-view";
import { requireRole } from "../../../../lib/auth/role-guard";
import { client } from "../../../../lib/orpc";
import { refresh } from "../../../../lib/refresh";
import { granted, loadRouteData } from "../../../../lib/route-data";

/**
 * Cursuscatalogus for Ondivera (docs/decisions/cursuscatalogus.md). Schools
 * use /cursussen; this page manages which Ondivera course each school may use
 * and the categories to filter on.
 */
export const Route = createFileRoute("/_protected/beheer/cursussen/")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "superadmin" }),
	loader: async ({ abortController }) => {
		const signal = abortController.signal;
		const [courses, categories, organizations] = await Promise.all([
			loadRouteData(signal, (s) => client.courses.list({}, { signal: s })),
			loadRouteData(signal, (s) => client.courses.catalog.categories.list(undefined, { signal: s })),
			loadRouteData(signal, (s) => client.admin.organizations.listAll(undefined, { signal: s })),
		]);
		return { courses, categories, organizations };
	},
	component: CatalogPage,
});

function CatalogPage() {
	const router = useRouter();
	const data = Route.useLoaderData();
	return (
		<RouteDataView
			data={data().courses}
			what="de cursussen"
			onRetry={() => void refresh(router, "courses")}
		>
			{(courses) => (
				<CourseCatalog
					courses={courses()}
					categories={granted(data().categories) ?? []}
					organizations={granted(data().organizations) ?? []}
				/>
			)}
		</RouteDataView>
	);
}
