import { type Browser, chromium } from "playwright";

/**
 * HTML → PDF for a coachplan submission (#20), per tooling decision: Playwright
 * headless Chromium. We render a self-contained HTML document (inline styles, no
 * external fonts/network) and return the PDF bytes so a procedure can stream it
 * back as a downloadable file.
 *
 * DoS hardening: launching a fresh Chromium per request is expensive (hundreds
 * of MB + CPU spike) and a trivial DoS vector. We instead keep a single
 * lazily-launched Browser singleton (relaunched if it disconnects/crashes) and
 * cap the number of concurrent page renders with a small semaphore, so a burst
 * of requests can't exhaust memory. Docker must ship Chromium (see tooling.md).
 */

export interface PdfQuestion {
	label: string;
	helpText?: string | null;
	theme?: string;
	section: "leerling" | "coach";
	/** Rendered answer value (already humanised: chips joined, scale text, …). */
	answer?: string | null;
	discussWithCoach?: boolean;
	deliberatelySkipped?: boolean;
}

export interface PdfPlan {
	templateName: string;
	leerlingName: string;
	coachName?: string | null;
	organizationName?: string | null;
	approvedWithParents: boolean;
	learningPreferences: string[];
	generatedAt: Date;
	questions: PdfQuestion[];
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Build the printable HTML document for a plan. */
export function renderPlanHtml(plan: PdfPlan): string {
	const themes = new Map<string, PdfQuestion[]>();
	for (const q of plan.questions) {
		const key = q.theme || (q.section === "coach" ? "Coachgedeelte" : "Vragen");
		if (!themes.has(key)) themes.set(key, []);
		themes.get(key)?.push(q);
	}

	const sections = [...themes.entries()]
		.map(([theme, qs]) => {
			const rows = qs
				.map((q) => {
					let answerHtml: string;
					if (q.deliberatelySkipped) {
						answerHtml = `<span class="flag skip">Bewust overgeslagen</span>`;
					} else if (!q.answer) {
						answerHtml = `<span class="empty">Niet ingevuld</span>`;
					} else {
						answerHtml = esc(q.answer).replace(/\n/g, "<br/>");
					}
					const discuss = q.discussWithCoach
						? `<div class="flag discuss">Bespreken met coach</div>`
						: "";
					return `<div class="qa">
						<div class="q">${esc(q.label)}</div>
						<div class="a">${answerHtml}</div>
						${discuss}
					</div>`;
				})
				.join("");
			return `<section class="theme"><h2>${esc(theme)}</h2>${rows}</section>`;
		})
		.join("");

	const prefs = plan.learningPreferences.length
		? `<div class="prefs"><h2>Leervoorkeuren</h2><div class="chips">${plan.learningPreferences
				.map((p) => `<span class="chip">${esc(p)}</span>`)
				.join("")}</div></div>`
		: "";

	return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"/>
<style>
	* { box-sizing: border-box; }
	body { font-family: -apple-system, system-ui, sans-serif; color: #1d2430; margin: 0; padding: 40px; font-size: 13px; line-height: 1.5; }
	h1 { font-size: 24px; margin: 0 0 4px; }
	h2 { font-size: 15px; margin: 0 0 10px; color: #3b4a5a; border-bottom: 1px solid #e3e8ef; padding-bottom: 6px; }
	.meta { color: #6b7785; font-size: 12px; margin-bottom: 24px; }
	.meta strong { color: #1d2430; }
	.theme, .prefs { margin-bottom: 24px; page-break-inside: avoid; }
	.qa { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #f0f3f7; }
	.q { font-weight: 600; color: #3b4a5a; margin-bottom: 4px; }
	.a { color: #1d2430; white-space: pre-wrap; }
	.empty { color: #9aa6b2; font-style: italic; }
	.flag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-top: 6px; }
	.flag.discuss { background: #fef0e6; color: #b5570f; }
	.flag.skip { background: #fff4d6; color: #94650a; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip { background: #eef2ff; color: #3a4fb8; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
	.parents { margin-top: 24px; padding: 10px 14px; background: #e8f7ee; color: #1c7a45; border-radius: 8px; font-size: 12px; }
</style></head>
<body>
	<h1>${esc(plan.templateName)}</h1>
	<div class="meta">
		Leerling: <strong>${esc(plan.leerlingName)}</strong>
		${plan.coachName ? ` · Coach: <strong>${esc(plan.coachName)}</strong>` : ""}
		${plan.organizationName ? ` · ${esc(plan.organizationName)}` : ""}
		<br/>Gegenereerd op ${plan.generatedAt.toLocaleDateString("nl-NL")}
	</div>
	${prefs}
	${sections}
	${plan.approvedWithParents ? `<div class="parents">✓ Dit plan is afgestemd met de ouders.</div>` : ""}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Browser singleton + concurrency cap
// ---------------------------------------------------------------------------

/** Max concurrent page renders; further requests queue (back-pressure). */
const MAX_CONCURRENT_RENDERS = 3;

let browserPromise: Promise<Browser> | undefined;

/** Lazily launch (or relaunch, if disconnected) the shared Chromium browser. */
async function getBrowser(): Promise<Browser> {
	if (browserPromise) {
		try {
			const existing = await browserPromise;
			if (existing.isConnected()) return existing;
		} catch {
			// Previous launch failed/closed — fall through and relaunch.
		}
	}
	browserPromise = chromium.launch({
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	return browserPromise;
}

// Tiny FIFO semaphore: resolves a waiter when a slot frees up.
let activeRenders = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
	if (activeRenders < MAX_CONCURRENT_RENDERS) {
		activeRenders += 1;
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
	const next = waiters.shift();
	if (next) {
		// Hand the slot directly to the next waiter (activeRenders unchanged).
		next();
	} else {
		activeRenders -= 1;
	}
}

/**
 * Render a plan to PDF bytes via headless Chromium.
 *
 * Reuses a shared browser singleton and caps concurrent renders. The exported
 * signature is unchanged so the caller (coachplan/index.ts) needs no edits.
 */
export async function renderPlanPdf(plan: PdfPlan): Promise<Uint8Array> {
	const html = renderPlanHtml(plan);
	await acquireSlot();
	try {
		const browser = await getBrowser();
		// One isolated context per render so cookies/storage never leak between
		// requests; cheaper than a full browser launch.
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			await page.setContent(html, { waitUntil: "networkidle" });
			const pdf = await page.pdf({
				format: "A4",
				printBackground: true,
				margin: { top: "0", bottom: "0", left: "0", right: "0" },
			});
			return new Uint8Array(pdf);
		} finally {
			await context.close();
		}
	} finally {
		releaseSlot();
	}
}
