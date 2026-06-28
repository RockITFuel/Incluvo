/**
 * Idempotent ingestion of the kennisdocumenten for the AI-advies RAG-laag
 * (#20/#22). Reads the extracted source texts in
 * `apps/server/seed-data/kennisdocumenten/` (+ `manifest.json`), chunks each
 * document, embeds every chunk via the active AI provider (mock by default —
 * see `src/ai/provider.ts`), and stores them in `kennisdocument(_chunk)`.
 *
 * Requires pgvector: run `bun run db:pgvector` (CREATE EXTENSION) and
 * `bun run db:push` before this. Run with:
 *   `bun run --cwd apps/server seed:kennis`
 *
 * The source docs are general reference material (UDL strategies, doelgroep-
 * analyse, manuscript) — NOT pupil PII — so embedding them is low-AVG-risk.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const schema = await import("@incluvo/drizzle/schema");
const { sql, eq, and, isNull } = await import("drizzle-orm");
const { getAiProvider } = await import("./ai/provider");

const { kennisdocument, kennisdocumentChunk } = schema;

interface ManifestEntry {
	file: string;
	title: string;
	sourceName: string;
	sourceType: string;
}

const DATA_DIR = join(import.meta.dir, "..", "seed-data", "kennisdocumenten");

/** ~1200-char chunks on paragraph boundaries with light overlap. */
function chunkText(text: string, target = 1200, overlap = 150): string[] {
	const paras = text
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	const chunks: string[] = [];
	let buf = "";
	for (const p of paras) {
		if (buf && buf.length + p.length + 1 > target) {
			chunks.push(buf);
			buf = buf.slice(Math.max(0, buf.length - overlap));
		}
		buf = buf ? `${buf} ${p}` : p;
		// A single very long paragraph: hard-split it.
		while (buf.length > target * 1.6) {
			chunks.push(buf.slice(0, target));
			buf = buf.slice(target - overlap);
		}
	}
	if (buf.trim()) chunks.push(buf.trim());
	return chunks;
}

async function ensurePgvector(): Promise<void> {
	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
	// ANN index for cosine distance (created here so db:push stays clean).
	await db.execute(
		sql`CREATE INDEX IF NOT EXISTS kennisdocument_chunk_embedding_idx ON kennisdocument_chunk USING hnsw (embedding vector_cosine_ops)`,
	);
}

async function ingest(entry: ManifestEntry): Promise<void> {
	const text = readFileSync(join(DATA_DIR, entry.file), "utf8");
	const chunks = chunkText(text);

	// Idempotent: one global (org IS NULL) doc per sourceName; replace its chunks.
	const [existing] = await db
		.select({ id: kennisdocument.id })
		.from(kennisdocument)
		.where(
			and(
				eq(kennisdocument.sourceName, entry.sourceName),
				isNull(kennisdocument.organizationId),
			),
		);
	let docId = existing?.id;
	if (docId) {
		await db
			.delete(kennisdocumentChunk)
			.where(eq(kennisdocumentChunk.documentId, docId));
	} else {
		const [inserted] = await db
			.insert(kennisdocument)
			.values({
				organizationId: null,
				title: entry.title,
				sourceName: entry.sourceName,
				sourceType: entry.sourceType,
			})
			.returning({ id: kennisdocument.id });
		if (!inserted) throw new Error(`Failed to insert document ${entry.title}`);
		docId = inserted.id;
	}

	// Embed in batches to keep requests bounded.
	const provider = getAiProvider();
	const BATCH = 64;
	for (let start = 0; start < chunks.length; start += BATCH) {
		const slice = chunks.slice(start, start + BATCH);
		const vectors = await provider.embed(slice);
		await db.insert(kennisdocumentChunk).values(
			slice.map((content, i) => ({
				documentId: docId!,
				ordinal: start + i,
				content,
				embedding: vectors[i] ?? null,
			})),
		);
	}
	console.log(`  + ${entry.title}: ${chunks.length} chunks (provider: ${provider.mock ? "mock" : provider.model})`);
}

async function main() {
	console.log("Seeding kennisdocumenten (#20/#22)…");
	await ensurePgvector();
	const manifest = JSON.parse(
		readFileSync(join(DATA_DIR, "manifest.json"), "utf8"),
	) as ManifestEntry[];
	for (const entry of manifest) await ingest(entry);
	console.log("Done.");
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
