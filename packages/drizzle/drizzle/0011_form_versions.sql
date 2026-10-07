-- Form versions (D5) and one place for coach answers (#18).
--
-- 1. Questions get a stable `key`. A school copy's questions take the key of
--    the Ondivera question they were copied from (matched on position + label),
--    so answers can carry over between versions and copies.
ALTER TABLE "form_question" ADD COLUMN "key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "form_question" c SET key = p.key
FROM "form_template" ct
JOIN "form_question" p ON p.template_id = ct.parent_template_id
WHERE c.template_id = ct.id AND p.position = c.position AND p.label = c.label;--> statement-breakpoint
-- 2. Every existing template is version 1 of its own family.
ALTER TABLE "form_template" ADD COLUMN "family_id" uuid;--> statement-breakpoint
UPDATE "form_template" SET family_id = id;--> statement-breakpoint
ALTER TABLE "form_template" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "form_template" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "form_template_family_version_uq" ON "form_template" USING btree ("family_id","version");--> statement-breakpoint
-- 3. A coach's mapping override becomes the coach's answer (unless the coach
--    already answered that question), and a mapped leerling answer pre-fills
--    coach questions that are still empty. Then the override column goes.
INSERT INTO "form_answer" (submission_id, question_id, value)
SELECT m.submission_id, m.coach_question_id, m.override_value
FROM "answer_coach_mapping" m
WHERE m.override_value IS NOT NULL
ON CONFLICT (submission_id, question_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "form_answer" (submission_id, question_id, value, value_json)
SELECT m.submission_id, m.coach_question_id, a.value, a.value_json
FROM "answer_coach_mapping" m
JOIN "form_answer" a ON a.id = m.source_answer_id
ON CONFLICT (submission_id, question_id) DO NOTHING;--> statement-breakpoint
ALTER TABLE "answer_coach_mapping" DROP COLUMN "override_value";
