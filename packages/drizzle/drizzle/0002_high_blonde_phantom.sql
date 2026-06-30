CREATE TABLE "kennisdocument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"title" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text DEFAULT 'text' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kennisdocument_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_question" ADD COLUMN "maps_to_question_id" uuid;--> statement-breakpoint
ALTER TABLE "kennisdocument" ADD CONSTRAINT "kennisdocument_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kennisdocument_chunk" ADD CONSTRAINT "kennisdocument_chunk_document_id_kennisdocument_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kennisdocument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kennisdocument_chunk_document_idx" ON "kennisdocument_chunk" USING btree ("document_id");