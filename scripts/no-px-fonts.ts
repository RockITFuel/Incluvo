/**
 * Fails when apps/web uses a px font size (WCAG 1.4.4, fix plan 4.1). Text has
 * to be in rem so it follows the leerling's text-size setting and the
 * browser's own. Run by `bun run lint`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../apps/web/src");
const PATTERNS = [
	/"font-size":\s*"[0-9.]+px"/g, // inline style objects
	/font-size:\s*[0-9.]+px/g, // CSS
	/\btext-\[[0-9.]+px\]/g, // Tailwind arbitrary values
];

function* files(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else if (/\.(tsx?|css)$/.test(entry.name) && !entry.name.includes("routeTree")) yield path;
	}
}

let found = 0;
for (const path of files(ROOT)) {
	const lines = readFileSync(path, "utf8").split("\n");
	lines.forEach((line, i) => {
		for (const re of PATTERNS) {
			for (const m of line.matchAll(re)) {
				console.error(`${path.replace(`${ROOT}/`, "apps/web/src/")}:${i + 1}: ${m[0]} — use rem`);
				found++;
			}
		}
	});
}
if (found > 0) {
	console.error(`\n${found} px font size(s). Use rem (16px = 1rem) so text scales.`);
	process.exit(1);
}
