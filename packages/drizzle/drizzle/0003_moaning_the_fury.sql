ALTER TABLE "answer_coach_mapping" DROP CONSTRAINT "answer_coach_mapping_coach_question_id_form_question_id_fk";
--> statement-breakpoint
ALTER TABLE "form_answer" DROP CONSTRAINT "form_answer_question_id_form_question_id_fk";
--> statement-breakpoint
DROP INDEX "content_progress_leerling_block_idx";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "direct_key" text;--> statement-breakpoint
ALTER TABLE "kennisdocument" ADD COLUMN "embed_signature" text;--> statement-breakpoint
ALTER TABLE "answer_coach_mapping" ADD CONSTRAINT "answer_coach_mapping_coach_question_id_form_question_id_fk" FOREIGN KEY ("coach_question_id") REFERENCES "public"."form_question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_answer" ADD CONSTRAINT "form_answer_question_id_form_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."form_question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- dedupe conversation_member (keep one row per (conversation,user))
DELETE FROM conversation_member a USING conversation_member b
WHERE a.conversation_id = b.conversation_id AND a.user_id = b.user_id AND a.ctid > b.ctid;--> statement-breakpoint
-- move messages of duplicate direct conversations to the keeper (oldest per pair)
WITH pairs AS (
  SELECT c.id, c.created_at, string_agg(cm.user_id, ':' ORDER BY cm.user_id) AS pair
  FROM conversation c JOIN conversation_member cm ON cm.conversation_id = c.id
  WHERE c.kind = 'direct' GROUP BY c.id
), ranked AS (
  SELECT id, pair,
         row_number() OVER (PARTITION BY pair ORDER BY created_at, id) AS rn,
         first_value(id) OVER (PARTITION BY pair ORDER BY created_at, id) AS keeper
  FROM pairs
)
UPDATE message m SET conversation_id = r.keeper FROM ranked r
WHERE m.conversation_id = r.id AND r.rn > 1;--> statement-breakpoint
-- delete the duplicate direct conversations (members cascade)
WITH pairs AS (
  SELECT c.id, c.created_at, string_agg(cm.user_id, ':' ORDER BY cm.user_id) AS pair
  FROM conversation c JOIN conversation_member cm ON cm.conversation_id = c.id
  WHERE c.kind = 'direct' GROUP BY c.id
), ranked AS (
  SELECT id, pair,
         row_number() OVER (PARTITION BY pair ORDER BY created_at, id) AS rn
  FROM pairs
)
DELETE FROM conversation c USING ranked r WHERE c.id = r.id AND r.rn > 1;--> statement-breakpoint
-- backfill direct_key on remaining direct conversations
WITH pairs AS (
  SELECT c.id, string_agg(cm.user_id, ':' ORDER BY cm.user_id) AS pair
  FROM conversation c JOIN conversation_member cm ON cm.conversation_id = c.id
  WHERE c.kind = 'direct' GROUP BY c.id
)
UPDATE conversation c SET direct_key = p.pair FROM pairs p WHERE c.id = p.id;--> statement-breakpoint
-- dedupe content_progress (keep most recently updated)
DELETE FROM content_progress a USING content_progress b
WHERE a.leerling_id = b.leerling_id AND a.content_block_id = b.content_block_id
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.ctid > b.ctid));--> statement-breakpoint
CREATE UNIQUE INDEX "content_progress_leerling_block_uq" ON "content_progress" USING btree ("leerling_id","content_block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_direct_key_uq" ON "conversation" USING btree ("direct_key");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_member_conv_user_uq" ON "conversation_member" USING btree ("conversation_id","user_id");