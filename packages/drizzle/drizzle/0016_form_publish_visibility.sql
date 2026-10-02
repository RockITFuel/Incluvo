ALTER TABLE "form_question" ADD COLUMN "visible_to_leerling" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "form_template" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
-- Every existing form was in use as-is: treat it as published.
UPDATE "form_template" SET "published_at" = "created_at" WHERE "published_at" IS NULL;
