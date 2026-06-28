import { loadRootEnv } from "../load-env";

loadRootEnv();

const { db } = await import("../client");
const { item } = await import("../schema/items");

/**
 * Minimal seed. Run with: `bun run --cwd packages/drizzle seed`
 * (requires DATABASE_URL and a pushed schema).
 */
async function main() {
	console.log("Seeding sample items…");

	await db
		.insert(item)
		.values([
			{ title: "Welkom bij Incluvo", description: "Eerste voorbeelditem.", status: "open" },
			{ title: "Toegankelijkheid (WCAG AA)", description: "Controleer contrast en focus.", status: "in_progress" },
			{ title: "Coachplan opzetten", description: "Skeleton vertical slice.", status: "done" },
		])
		.onConflictDoNothing();

	console.log("Done.");
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
