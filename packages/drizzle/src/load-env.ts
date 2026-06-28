import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loads the monorepo's single root `.env` into `process.env` for standalone
 * tooling (drizzle-kit, seed scripts) that runs from this package's directory.
 * Existing env vars win, so an explicitly exported DATABASE_URL is never
 * overwritten. No-op when DATABASE_URL is already set.
 */
export function loadRootEnv(): void {
	if (process.env.DATABASE_URL) return;

	let dir = process.cwd();
	for (let i = 0; i < 6; i++) {
		const candidate = join(dir, ".env");
		if (existsSync(candidate)) {
			for (const line of readFileSync(candidate, "utf8").split("\n")) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const eq = trimmed.indexOf("=");
				if (eq === -1) continue;
				const key = trimmed.slice(0, eq).trim();
				let value = trimmed.slice(eq + 1).trim();
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1);
				}
				if (!(key in process.env)) process.env[key] = value;
			}
			return;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
}
