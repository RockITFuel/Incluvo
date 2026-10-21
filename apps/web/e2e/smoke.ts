/**
 * Smoke test for the SPA: logs in as each role, opens every page it may see,
 * clicks through the menu (client-side navigation) and runs one write per
 * area. Fails on a page without an <h1>, an error message on screen, or any
 * browser error (uncaught exception or console.error).
 *
 *   BASE_URL=http://localhost:3200 bun e2e/smoke.ts
 *
 * Needs the app running against a database with the demo seed
 * (`bun run --cwd apps/server setup-db`).
 */
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const PASSWORD = "incluvo123";

const PAGES: Record<string, string[]> = {
	"leerling@incluvo.local": ["/welkom", "/taken", "/cursussen", "/plan", "/chat", "/profiel", "/notificaties"],
	"coach@incluvo.local": ["/dashboard", "/plan", "/cursussen", "/chat", "/assistent", "/taken", "/notificaties", "/profiel"],
	"keyuser@incluvo.local": ["/leerlingen", "/coaches", "/beheer", "/plan/beheer", "/beheer/cursussen", "/cursussen"],
	"ontwikkelaar@incluvo.local": ["/cursussen"],
	"superadmin@incluvo.local": ["/beheer", "/beheer/cursussen"],
};

const failures: string[] = [];

async function newPage(browser: Browser, errors: string[]): Promise<Page> {
	const page = await (await browser.newContext()).newPage();
	page.on("console", (m) => {
		if (m.type() === "error") errors.push(`${new URL(page.url()).pathname}: console: ${m.text().slice(0, 300)}`);
	});
	page.on("pageerror", (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 300)}`));
	return page;
}

async function login(page: Page, email: string) {
	await page.goto(`${BASE}/login`);
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Wachtwoord").fill(PASSWORD);
	await page.getByRole("button", { name: "Inloggen" }).click();
	await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** The page rendered: an <h1>, no error state, no new browser errors. */
async function expectPage(page: Page, label: string, errors: string[]) {
	const before = errors.length;
	try {
		await page.locator("h1").first().waitFor({ timeout: 15_000 });
		await page.waitForTimeout(800);
		const alerts = await page.locator('[role="alert"]').allInnerTexts();
		const broken = alerts.filter((t) => /niet laden|lukte niet|geen toegang|Er ging iets mis/i.test(t));
		if (broken.length) failures.push(`${label}: error on screen: ${broken.join(" | ").slice(0, 200)}`);
	} catch (error) {
		failures.push(`${label}: no <h1> (${(error as Error).message.split("\n")[0]})`);
	}
	const fresh = errors.slice(before);
	if (fresh.length) failures.push(...fresh.map((e) => `${label}: ${e}`));
	console.log(`${failures.some((f) => f.startsWith(label)) ? "FAIL" : "ok  "} ${label}`);
}

const browser = await chromium.launch();
try {
	for (const [email, paths] of Object.entries(PAGES)) {
		const who = email.split("@")[0]!;
		const errors: string[] = [];
		const page = await newPage(browser, errors);
		await login(page, email);
		await expectPage(page, `${who} start`, errors);

		// Hard loads (deep links).
		for (const path of paths) {
			await page.goto(`${BASE}${path}`);
			await expectPage(page, `${who} ${path}`, errors);
		}

		// Client-side navigation through the menu.
		const links = await page.locator("nav a[href^='/']").evaluateAll((as) =>
			[...new Set(as.map((a) => a.getAttribute("href")!))],
		);
		for (const href of links) {
			await page.locator(`nav a[href='${href}']`).first().click();
			await page.waitForURL((url) => url.pathname === href, { timeout: 15_000 }).catch(() => {});
			await expectPage(page, `${who} nav ${href}`, errors);
		}

		// One write per role, through an action + targeted refresh.
		if (who === "leerling") {
			await page.goto(`${BASE}/taken`);
			await page.getByRole("button", { name: "Taak toevoegen" }).first().click();
			const title = `Smoke ${Date.now()}`;
			await page.getByLabel("Nieuwe taak").fill(title);
			await page.keyboard.press("Enter");
			// Without a date it lands under Toekomst.
			await page.getByRole("tab", { name: /Toekomst/ }).or(page.getByRole("button", { name: /Toekomst/ })).first().click();
			await page.getByText(title).first().waitFor({ timeout: 10_000 }).then(
				() => console.log("ok   leerling write: task added and shown"),
				() => failures.push("leerling write: added task did not appear"),
			);
		}
		if (who === "coach") {
			await page.goto(`${BASE}/dashboard`);
			await page.locator("h1").first().waitFor();
			const detail = page.getByRole("link", { name: /^Profiel van / }).first();
			if ((await detail.count()) === 0) failures.push("coach: no leerling on the dashboard");
			else {
				await detail.click();
				await page.waitForURL((url) => url.pathname.startsWith("/dashboard/"), { timeout: 15_000 });
				await expectPage(page, "coach leerling detail", errors);
			}
		}
		await page.context().close();
	}
} catch (error) {
	console.error(`\nThe smoke test itself failed: ${(error as Error).message.split("\n")[0]}`);
	process.exit(2);
} finally {
	await browser.close();
}

if (failures.length > 0) {
	console.error(`\n${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
	process.exit(1);
}
console.log("\nSmoke test passed.");
