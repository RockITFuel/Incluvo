-- Remove existing duplicates before the unique indexes below can be created.
-- Rows are kept, not merged: the most recently updated row wins, except where
-- noted. Submissions are renumbered instead of deleted (grades hang off them).
DELETE FROM "coach_assignment" t USING (
	SELECT id, row_number() OVER (PARTITION BY coach_id, leerling_id ORDER BY updated_at DESC, id) AS rn FROM "coach_assignment"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
DELETE FROM "membership" t USING (
	SELECT id, row_number() OVER (PARTITION BY user_id, organization_id ORDER BY updated_at DESC, id) AS rn FROM "membership"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
-- Point coach mappings at the surviving answer before dropping its duplicates.
WITH ranked AS (
	SELECT id, first_value(id) OVER (PARTITION BY submission_id, question_id ORDER BY updated_at DESC, id) AS keep_id FROM "form_answer"
)
UPDATE "answer_coach_mapping" m SET source_answer_id = r.keep_id FROM ranked r WHERE m.source_answer_id = r.id AND r.id <> r.keep_id;--> statement-breakpoint
DELETE FROM "form_answer" t USING (
	SELECT id, row_number() OVER (PARTITION BY submission_id, question_id ORDER BY updated_at DESC, id) AS rn FROM "form_answer"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
DELETE FROM "form_assignment" t USING (
	SELECT id, row_number() OVER (PARTITION BY organization_id, leerling_id ORDER BY updated_at DESC, id) AS rn FROM "form_assignment"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
-- Several school defaults: keep the most recently updated as the default.
UPDATE "form_template" t SET is_school_default = false FROM (
	SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY updated_at DESC, id) AS rn FROM "form_template" WHERE is_school_default
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
DELETE FROM "learning_preference_label" t USING (
	SELECT id, row_number() OVER (PARTITION BY submission_id, label ORDER BY created_at, id) AS rn FROM "learning_preference_label"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
DELETE FROM "content_block_label" t USING (
	SELECT id, row_number() OVER (PARTITION BY content_block_id, label ORDER BY created_at, id) AS rn FROM "content_block_label"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
UPDATE "assignment_submission" t SET attempt = d.rn FROM (
	SELECT id, row_number() OVER (PARTITION BY assignment_id, leerling_id ORDER BY coalesce(submitted_at, created_at), id) AS rn FROM "assignment_submission"
) d WHERE t.id = d.id AND t.attempt <> d.rn;--> statement-breakpoint
-- Duplicate opdracht tasks: keep a done one if any, else the most recent.
DELETE FROM "task" t USING (
	SELECT id, row_number() OVER (PARTITION BY assignment_id, leerling_id ORDER BY done DESC, updated_at DESC, id) AS rn FROM "task" WHERE assignment_id IS NOT NULL
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_assignment_pair_uq" ON "coach_assignment" USING btree ("coach_id","leerling_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_org_uq" ON "membership" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_answer_submission_question_uq" ON "form_answer" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_assignment_leerling_uq" ON "form_assignment" USING btree ("organization_id","leerling_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_template_school_default_uq" ON "form_template" USING btree ("organization_id") WHERE "form_template"."is_school_default";--> statement-breakpoint
CREATE UNIQUE INDEX "learning_preference_label_uq" ON "learning_preference_label" USING btree ("submission_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_submission_attempt_uq" ON "assignment_submission" USING btree ("assignment_id","leerling_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "content_block_label_uq" ON "content_block_label" USING btree ("content_block_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignment_leerling_uq" ON "task" USING btree ("assignment_id","leerling_id") WHERE "task"."assignment_id" is not null;