/**
 * Kennisdocumenten retrieval for the AI-advies (#20/#22).
 *
 * Embeds the coach's question and pulls the nearest `kennisdocument_chunk` rows
 * by pgvector cosine distance, scoped to Ondivera-global documents plus the
 * coach's own tenant. The result is a compact context block injected into the
 * advice system prompt. Best-effort: callers wrap this so a retrieval failure
 * (e.g. pgvector not yet enabled) never breaks the advice stream.
 */

import { kennisdocument, kennisdocumentChunk } from "@incluvo/drizzle/schema";
import { and, cosineDistance, eq, isNull, or, sql } from "drizzle-orm";
import type { AiProvider } from "./provider";

type Db = typeof import("@incluvo/drizzle").db;

export interface KennisHit {
	title: string;
	sourceName: string;
	content: string;
	distance: number;
}

/** Retrieve the top-K nearest kennisdocument chunks for a query. */
export async function retrieveKennisHits(
	db: Db,
	provider: AiProvider,
	query: string,
	opts: {
		organizationId?: string | null;
		limit?: number;
		signal?: AbortSignal;
	} = {},
): Promise<KennisHit[]> {
	const text = query.trim();
	if (!text) return [];
	const [embedding] = await provider.embed([text], opts.signal);
	if (!embedding) return [];

	const distance = cosineDistance(kennisdocumentChunk.embedding, embedding);
	const orgId = opts.organizationId ?? null;
	// Ondivera-global docs (org IS NULL) + the coach's own tenant.
	const scope = orgId
		? or(isNull(kennisdocument.organizationId), eq(kennisdocument.organizationId, orgId))
		: isNull(kennisdocument.organizationId);

	const rows = await db
		.select({
			title: kennisdocument.title,
			sourceName: kennisdocument.sourceName,
			content: kennisdocumentChunk.content,
			distance: sql<number>`${distance}`,
		})
		.from(kennisdocumentChunk)
		.innerJoin(
			kennisdocument,
			eq(kennisdocumentChunk.documentId, kennisdocument.id),
		)
		// Only compare vectors from the SAME embedding space — cosine distance
		// between e.g. mock-seeded and real query embeddings is silent garbage.
		.where(and(scope, eq(kennisdocument.embedSignature, provider.embedSignature)))
		.orderBy(distance)
		.limit(opts.limit ?? 4);

	if (rows.length === 0) {
		const [anyDoc] = await db
			.select({ id: kennisdocument.id })
			.from(kennisdocument)
			.limit(1);
		if (anyDoc) {
			console.warn(
				`kennis retrieval: embed-signature mismatch (verwacht ${provider.embedSignature}) — her-seed kennisdocumenten (seed:kennis)`,
			);
		}
		return [];
	}

	return rows.map((r) => ({
		title: r.title,
		sourceName: r.sourceName,
		content: r.content,
		distance: Number(r.distance),
	}));
}

/**
 * Build a system-prompt context block from retrieved chunks, or null when there
 * is nothing to add. Each chunk is labelled with its source for transparency.
 */
export function formatKennisContext(hits: KennisHit[]): string | null {
	if (hits.length === 0) return null;
	const blocks = hits
		.map((h, i) => `Fragment ${i + 1} — bron: ${h.title}\n${h.content.trim()}`)
		.join("\n\n");
	return (
		"Relevante kennisdocumenten (gebruik dit als achtergrond; verzin niets bij):\n\n" +
		blocks
	);
}
