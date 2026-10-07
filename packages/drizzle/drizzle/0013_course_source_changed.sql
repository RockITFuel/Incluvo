ALTER TABLE "course" ADD COLUMN "content_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "source_content_at" timestamp;--> statement-breakpoint
-- Existing copies: assume they were up to date with their source when made.
UPDATE "course" SET content_updated_at = updated_at;--> statement-breakpoint
UPDATE "course" SET source_content_at = created_at WHERE parent_course_id IS NOT NULL;
