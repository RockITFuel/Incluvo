-- Audit rows used to hold full copies of pupils' free text (chat messages,
-- answers, transcripts, submissions, feedback, notifications, proposals,
-- leervoorkeuren). The trigger now stores only ids for those tables
-- (audit-trigger.sql, `keys_only`); strip the copies already stored so
-- deleting that data under the AVG doesn't leave it in the audit log.
UPDATE "audit_log"
SET
	"before" = CASE WHEN "before" IS NULL THEN NULL ELSE jsonb_build_object('id', "before" -> 'id') END,
	"after" = CASE WHEN "after" IS NULL THEN NULL ELSE jsonb_build_object('id', "after" -> 'id') END
WHERE "table_name" IN (
	'form_answer', 'answer_coach_mapping', 'learning_preference_label', 'transcription',
	'assignment_submission', 'assignment_grade', 'proposed_assignment', 'message', 'notification'
);
