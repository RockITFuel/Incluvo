import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	vector,
} from "drizzle-orm/pg-core";
import { organization } from "./organization";

/**
 * Kennisdocumenten — RAG-laag voor het AI-advies (#20/#22).
 *
 * Reference documents (UDL-strategieën, doelgroepanalyse, manuscript — Mark's
 * "Input Incluvo" attachments) are ingested as `kennisdocument` rows, split into
 * `kennisdocument_chunk` rows, and each chunk gets a pgvector embedding. The
 * assistant (#22) embeds the coach's question and retrieves the nearest chunks
 * to ground its advice.
 *
 * REQUIRES the pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
 * (run `bun run db:pgvector` once before `db:push`). The image is
 * `pgvector/pgvector:pg18` (docker-compose).
 *
 * NB: these documents are general reference material, NOT pupil PII — so
 * embedding them carries far less AVG weight than coachplan data.
 */

/** Embedding dimension. Matches OpenAI `text-embedding-3-small` (and the mock). */
export const KENNIS_EMBED_DIM = 1536;

export const kennisdocument = pgTable("kennisdocument", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Null = an Ondivera-global document available to every tenant; otherwise the
	// owning school. Retrieval unions global + the actor's own tenant.
	organizationId: uuid("organization_id").references(() => organization.id, {
		onDelete: "cascade",
	}),
	title: text("title").notNull(),
	/** Original source filename (provenance). */
	sourceName: text("source_name").notNull(),
	/** "pdf" | "docx" | "text" — informational. */
	sourceType: text("source_type").notNull().default("text"),
	description: text("description"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kennisdocumentChunk = pgTable(
	"kennisdocument_chunk",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		documentId: uuid("document_id")
			.notNull()
			.references(() => kennisdocument.id, { onDelete: "cascade" }),
		/** 0-based order of the chunk within its document. */
		ordinal: integer("ordinal").notNull().default(0),
		content: text("content").notNull(),
		// pgvector embedding. The ANN index (hnsw, vector_cosine_ops) is created by
		// the ingestion script (db:pgvector / seed) rather than in-schema, so
		// `db:push` stays clean on a fresh database.
		embedding: vector("embedding", { dimensions: KENNIS_EMBED_DIM }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [index("kennisdocument_chunk_document_idx").on(t.documentId)],
);

export type Kennisdocument = typeof kennisdocument.$inferSelect;
export type NewKennisdocument = typeof kennisdocument.$inferInsert;
export type KennisdocumentChunk = typeof kennisdocumentChunk.$inferSelect;
export type NewKennisdocumentChunk = typeof kennisdocumentChunk.$inferInsert;

export const kennisdocumentRelations = relations(
	kennisdocument,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [kennisdocument.organizationId],
			references: [organization.id],
		}),
		chunks: many(kennisdocumentChunk),
	}),
);

export const kennisdocumentChunkRelations = relations(
	kennisdocumentChunk,
	({ one }) => ({
		document: one(kennisdocument, {
			fields: [kennisdocumentChunk.documentId],
			references: [kennisdocument.id],
		}),
	}),
);
