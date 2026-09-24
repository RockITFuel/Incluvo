import { useRouter } from "@tanstack/solid-router";
import { createSignal, onCleanup, onMount } from "solid-js";

const APP = "Incluvo";

/**
 * Page titles and route-change announcements (WCAG 2.4.2, 4.1.3, fix plan
 * 4.3). Every page has one `<h1>`; after each navigation this
 *   - sets `document.title` to "<name> – Incluvo": the `<h1>`, or the
 *     page's `data-page-title` when its `<h1>` isn't the page name (the
 *     wizard's `<h1>` is the current question),
 *   - on client-side navigations (not the first load) moves focus to that
 *     `<h1>`, so keyboard and screen-reader users start at the new content,
 *   - announces the page in a polite live region.
 * Pages render their `<h1>` after data loads, so it waits for it briefly.
 */
export function RouteAnnouncer() {
	const router = useRouter();
	const [message, setMessage] = createSignal("");
	let firstLoad = true;
	// The heading of the page we're leaving: right after navigation it can
	// still be in the DOM, and must not be mistaken for the new page's.
	let previous: HTMLElement | null = null;

	const pick = () => {
		const h = document.querySelector<HTMLElement>("main h1, #app h1");
		return h && h !== previous && h.isConnected ? h : null;
	};

	const findHeading = (): Promise<HTMLElement | null> =>
		new Promise((resolve) => {
			const found = pick();
			if (found) return resolve(found);
			const observer = new MutationObserver(() => {
				const h = pick();
				if (h) {
					observer.disconnect();
					clearTimeout(timer);
					resolve(h);
				}
			});
			const timer = setTimeout(() => {
				observer.disconnect();
				resolve(pick());
			}, 3000);
			observer.observe(document.body, { childList: true, subtree: true });
		});

	const pageName = (heading: HTMLElement | null) =>
		heading?.closest<HTMLElement>("[data-page-title]")?.dataset.pageTitle ??
		heading?.textContent?.replace(/\s+/g, " ").trim();

	const focus = (heading: HTMLElement) => {
		if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
		heading.focus({ preventScroll: true });
	};

	onMount(() => {
		const unsubscribe = router.subscribe("onResolved", async () => {
			const heading = await findHeading();
			const name = pageName(heading);
			document.title = name ? `${name} – ${APP}` : APP;
			previous = heading;
			if (firstLoad) {
				firstLoad = false;
				return;
			}
			if (heading) {
				focus(heading);
				// A page may re-render its heading once its data arrives; keep focus
				// on the heading rather than losing it to <body>.
				setTimeout(() => {
					const now = document.querySelector<HTMLElement>("main h1, #app h1");
					if (now && now !== heading && document.activeElement !== now) {
						previous = now;
						focus(now);
					}
				}, 600);
			}
			// Clear first so the same page twice is announced again.
			setMessage("");
			queueMicrotask(() => setMessage(name ? `Pagina: ${name}` : ""));
		});
		onCleanup(unsubscribe);
	});

	return (
		<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{message()}
		</div>
	);
}
