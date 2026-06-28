/**
 * AI layer configuration (Epic 7 — backlog #1 vertaling, #18 transcriptie,
 * #22 assistent).
 *
 * EU DATA RESIDENCY IS A HARD REQUIREMENT. The real provider path uses the
 * official `openai` SDK pointed at an **OpenAI-compatible EU endpoint**
 * (Azure OpenAI Data Zone EUR / Mistral EU) via a configurable `baseURL`.
 * Residency must be verified at the infra/contract level — see
 * `docs/research/ai-layer.md` §5; never assume defaults are EU.
 *
 * Config is read **directly from `process.env`** (not `env.ts`, which this epic
 * may not touch). The orchestrator should mirror these into `env.ts` /
 * `.env.example`:
 *
 *   AI_BASE_URL          OpenAI-compatible EU base URL (e.g. Azure Data Zone EUR)
 *   AI_API_KEY           API key for that endpoint
 *   AI_MODEL             chat/completions model id (advies + vertaling)
 *   AI_TRANSCRIBE_MODEL  speech-to-text model id (#18)
 *
 * When `AI_BASE_URL` or `AI_API_KEY` is unset we fall back to a deterministic
 * **MOCK** provider so the whole feature is demoable offline with no real
 * credentials. The UI surfaces a clear "MOCK" indicator in that mode.
 */

export interface AiConfig {
	/** True when the real OpenAI-compatible EU endpoint is configured. */
	readonly live: boolean;
	readonly baseURL: string | undefined;
	readonly apiKey: string | undefined;
	readonly model: string;
	readonly transcribeModel: string;
}

/**
 * EU DATA RESIDENCY ALLOW-LIST.
 *
 * `AI_BASE_URL` may point anywhere, so before we ever send minors' data to a
 * live provider we validate its host against an allow-list of approved
 * EU-resident endpoints and FAIL CLOSED if it isn't on the list.
 *
 * The default set covers Azure OpenAI (Sweden Central / EU data zones — all
 * `*.openai.azure.com`) and Mistral's EU API. Override via the
 * `AI_ALLOWED_HOSTS` env var (comma-separated). An entry may be:
 *   - an exact host  → "api.mistral.ai"
 *   - a wildcard     → "*.openai.azure.com"  (matches any sub-domain + apex)
 */
const DEFAULT_ALLOWED_HOSTS = [
	"*.openai.azure.com",
	"api.mistral.ai",
];

export function allowedAiHosts(): string[] {
	const raw = process.env.AI_ALLOWED_HOSTS?.trim();
	if (!raw) return DEFAULT_ALLOWED_HOSTS;
	const parsed = raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return parsed.length ? parsed : DEFAULT_ALLOWED_HOSTS;
}

function hostMatches(host: string, pattern: string): boolean {
	if (pattern.startsWith("*.")) {
		const suffix = pattern.slice(1); // ".openai.azure.com"
		const apex = pattern.slice(2); // "openai.azure.com"
		return host === apex || host.endsWith(suffix);
	}
	return host === pattern;
}

/** True when `baseURL`'s host is on the EU allow-list. */
export function isAllowedAiBaseUrl(baseURL: string): boolean {
	let host: string;
	try {
		host = new URL(baseURL).hostname.toLowerCase();
	} catch {
		return false;
	}
	return allowedAiHosts().some((p) => hostMatches(host, p));
}

/**
 * Assert that a live `AI_BASE_URL` is EU-allow-listed. Throws (fail closed) when
 * a live endpoint is configured but its host is not approved — so minors' data
 * can never silently flow to a non-EU endpoint. No-op for the mock provider.
 */
export function assertEuResidency(config: AiConfig): void {
	if (!config.live || !config.baseURL) return;
	if (!isAllowedAiBaseUrl(config.baseURL)) {
		const host = (() => {
			try {
				return new URL(config.baseURL as string).hostname;
			} catch {
				return config.baseURL;
			}
		})();
		throw new Error(
			`AI EU residency check failed: AI_BASE_URL host "${host}" is not on the ` +
				`approved allow-list (${allowedAiHosts().join(", ")}). Refusing to send ` +
				`minors' data to a non-EU endpoint. Fix AI_BASE_URL or set AI_ALLOWED_HOSTS.`,
		);
	}
}

export function readAiConfig(): AiConfig {
	const baseURL = process.env.AI_BASE_URL?.trim() || undefined;
	const apiKey = process.env.AI_API_KEY?.trim() || undefined;
	const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";
	const transcribeModel =
		process.env.AI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-transcribe";

	// Both a base URL and a key are required to go live; otherwise mock.
	const live = Boolean(baseURL && apiKey);

	return { live, baseURL, apiKey, model, transcribeModel };
}

/** Whether the AI layer is running against the mock provider (no credentials). */
export function isMockProvider(): boolean {
	return !readAiConfig().live;
}
