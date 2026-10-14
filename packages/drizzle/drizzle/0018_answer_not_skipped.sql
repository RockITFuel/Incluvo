-- INC-22: a question can't be both answered and skipped. Answers that have text
-- (or chosen options) but also the skip flag showed as "Overgeslagen"; keep the
-- answer and drop the flag.
UPDATE "form_answer"
SET "deliberately_skipped" = false, "updated_at" = now()
WHERE "deliberately_skipped"
	AND (coalesce(btrim("value"), '') <> '' OR coalesce("value_json", 'null'::jsonb) NOT IN ('null'::jsonb, '[]'::jsonb));
