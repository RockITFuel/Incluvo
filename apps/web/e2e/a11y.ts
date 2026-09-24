/**
 * Accessibility check (fix plan 4.6): logs in as each role, opens its main
 * pages and runs axe-core (WCAG 2.0/2.1/2.2 A + AA). Fails on any violation.
 *
 *   BASE_URL=http://localhost:3200 bun e2e/a11y.ts
 *
 * Needs the app running against a database with the demo seed
 * (`bun run --cwd apps/server setup-db`). Runs in CI (.github/workflows).
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const PASSWORD = "incluvo123";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PAGES: Record<string, string[]> = {
	"leerling@incluvo.local": ["/welkom", "/taken", "/cursussen", "/plan", "/chat", "/profiel", "/notificaties"],
	"coach@incluvo.local": ["/dashboard", "/plan", "/cursussen", "/chat", "/assistent"],
	"keyuser@incluvo.local": ["/beheer", "/plan/beheer"],
	"ontwikkelaar@incluvo.local": ["/cursussen"],
};

const failures: string[] = [];

async function check(page: Page, label: string) {
	// Pages render after their data arrives. (Not "networkidle": the live
	// updates keep a connection open.)
	await page.locator("h1").first().waitFor({ timeout: 15_000 });
	await page.waitForTimeout(1500);
	const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	for (const v of result.violations) {
		for (const node of v.nodes) {
			failures.push(`${label}: ${v.id} (${v.impact}) — ${node.target.join(" ")}\n    ${v.help}`);
		}
	}
	console.log(`${result.violations.length === 0 ? "ok  " : "FAIL"} ${label}`);
}

const browser = await chromium.launch();
try {
	const loginPage = await (await browser.newContext()).newPage();
	await loginPage.goto(`${BASE}/login`);
	await check(loginPage, "/login");

	for (const [email, paths] of Object.entries(PAGES)) {
		const page = await (await browser.newContext()).newPage();
		await page.goto(`${BASE}/login`);
		await page.getByLabel("E-mail").fill(email);
		await page.getByLabel("Wachtwoord").fill(PASSWORD);
		await page.getByRole("button", { name: "Inloggen" }).click();
		await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
		for (const path of paths) {
			await page.goto(`${BASE}${path}`);
			await check(page, `${email.split("@")[0]} ${path}`);
		}
	}
} finally {
	await browser.close();
}

if (failures.length > 0) {
	console.error(`\n${failures.length} accessibility violation(s):\n${failures.join("\n")}`);
	process.exit(1);
}
console.log("\nNo accessibility violations.");
