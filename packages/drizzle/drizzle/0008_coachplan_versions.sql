CREATE TABLE "coachplan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"leerling_id" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Empty drafts were created by merely opening /plan; they carry nothing.
DELETE FROM "form_submission" s
WHERE s.status = 'draft'
	AND NOT EXISTS (SELECT 1 FROM "form_answer" a WHERE a.submission_id = s.id)
	AND NOT EXISTS (SELECT 1 FROM "transcription" t WHERE t.submission_id = s.id);--> statement-breakpoint
ALTER TABLE "form_submission" ADD COLUMN "coachplan_id" uuid;--> statement-breakpoint
ALTER TABLE "form_submission" ADD COLUMN "version" integer;--> statement-breakpoint
-- One coachplan per leerling; every existing submission becomes a version,
-- numbered by creation date. The current version is the latest shared one.
INSERT INTO "coachplan" (organization_id, leerling_id)
SELECT DISTINCT organization_id, leerling_id FROM "form_submission";--> statement-breakpoint
UPDATE "form_submission" s SET coachplan_id = c.id
FROM "coachplan" c
WHERE c.organization_id = s.organization_id AND c.leerling_id = s.leerling_id;--> statement-breakpoint
UPDATE "form_submission" s SET version = v.n
FROM (
	SELECT id, row_number() OVER (PARTITION BY coachplan_id ORDER BY created_at, id) AS n
	FROM "form_submission"
) v
WHERE v.id = s.id;--> statement-breakpoint
UPDATE "coachplan" c SET current_version_id = (
	SELECT s.id FROM "form_submission" s
	WHERE s.coachplan_id = c.id AND s.status IN ('shared_with_leerling', 'completed')
	ORDER BY s.version DESC LIMIT 1
);--> statement-breakpoint
ALTER TABLE "form_submission" ALTER COLUMN "coachplan_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "form_submission" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coachplan" ADD CONSTRAINT "coachplan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coachplan" ADD CONSTRAINT "coachplan_leerling_id_user_id_fk" FOREIGN KEY ("leerling_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coachplan" ADD CONSTRAINT "coachplan_current_version_id_form_submission_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coachplan_leerling_uq" ON "coachplan" USING btree ("organization_id","leerling_id");--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_coachplan_id_coachplan_id_fk" FOREIGN KEY ("coachplan_id") REFERENCES "public"."coachplan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_submission_version_uq" ON "form_submission" USING btree ("coachplan_id","version");