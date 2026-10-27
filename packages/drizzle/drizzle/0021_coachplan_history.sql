-- INC-33: a leerling can have earlier coachplannen next to the actuele one.
-- Existing plans become the actuele plan (replaced_at null); the old unique
-- index already guaranteed one per leerling, so the new one holds as well.
ALTER TYPE "public"."notification_type" ADD VALUE 'coachplan_assigned' BEFORE 'task_due_today';--> statement-breakpoint
DROP INDEX "coachplan_leerling_uq";--> statement-breakpoint
ALTER TABLE "coachplan" ADD COLUMN "assigned_by_id" text;--> statement-breakpoint
ALTER TABLE "coachplan" ADD COLUMN "replaced_at" timestamp;--> statement-breakpoint
ALTER TABLE "coachplan" ADD CONSTRAINT "coachplan_assigned_by_id_user_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coachplan_actueel_uq" ON "coachplan" USING btree ("organization_id","leerling_id") WHERE "coachplan"."replaced_at" is null;--> statement-breakpoint
CREATE INDEX "coachplan_leerling_idx" ON "coachplan" USING btree ("leerling_id");