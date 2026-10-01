/**
 * Turn any error from the API (oRPC), better-auth or the network into a calm
 * Dutch sentence for the UI. Never shows a stack, an English developer message
 * or a status code.
 *
 * Server errors meant for users carry a Dutch message (e.g. "Deze school is
 * gearchiveerd…"); those are shown as-is. Anything else gets a message by
 * error code.
 */

const BY_CODE: Record<string, string> = {
	UNAUTHORIZED: "Je bent uitgelogd. Log opnieuw in om verder te gaan.",
	FORBIDDEN: "Je hebt hier geen toegang toe.",
	NOT_FOUND: "Dit bestaat niet (meer). Misschien is het verwijderd.",
	CONFLICT: "Dit bestaat al.",
	TOO_MANY_REQUESTS: "Even rustig aan. Probeer het over een paar minuten opnieuw.",
	SERVICE_UNAVAILABLE: "Het is even erg druk. Probeer het zo opnieuw.",
	TIMEOUT: "Dat duurde te lang. Probeer het opnieuw.",
	BAD_REQUEST: "Dat lukte niet. Controleer wat je hebt ingevuld.",
};

const GENERIC = "Er ging iets mis. Probeer het opnieuw.";
const OFFLINE = "Geen verbinding met Incluvo. Controleer je internet en probeer het opnieuw.";

/** Common Dutch words; a message with none of them is a developer message. */
const DUTCH = /\b(de|het|een|je|jouw|niet|geen|deze|dit|van|is|kan|kunnen|eerst|nog|al|met|voor|bij|op)\b/i;

export function friendlyError(error: unknown, fallback: string = GENERIC): string {
	if (!error) return fallback;
	if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;

	const e = error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };
	const message = typeof e.message === "string" ? e.message.trim() : "";

	// fetch() itself failed: server down or no network.
	if (e.name === "TypeError" && /fetch|network|load failed/i.test(message)) return OFFLINE;

	if (message && DUTCH.test(message) && message.length <= 300) return message;

	const code =
		typeof e.code === "string"
			? e.code
			: typeof e.status === "number"
				? statusToCode(e.status)
				: undefined;
	return (code && BY_CODE[code]) || fallback;
}

function statusToCode(status: number): string | undefined {
	switch (status) {
		case 400:
			return "BAD_REQUEST";
		case 401:
			return "UNAUTHORIZED";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 409:
			return "CONFLICT";
		case 429:
			return "TOO_MANY_REQUESTS";
		case 503:
			return "SERVICE_UNAVAILABLE";
		default:
			return undefined;
	}
}
