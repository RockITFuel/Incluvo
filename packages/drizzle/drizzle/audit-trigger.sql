-- Audit trigger: writes an append-only audit_log row on every change to an
-- audited table, attributing it to the per-request actor pinned in the
-- `app.actor_id` GUC (set by acquireRequestActor in src/client.ts).
--
-- Apply after `drizzle-kit push`/`migrate`:
--   psql "$DATABASE_URL" -f drizzle/audit-trigger.sql
--
-- Attach to a table with:
--   CREATE TRIGGER item_audit
--     AFTER INSERT OR UPDATE OR DELETE ON item
--     FOR EACH ROW EXECUTE FUNCTION record_audit();

CREATE OR REPLACE FUNCTION record_audit() RETURNS trigger AS $$
DECLARE
	v_actor text := COALESCE(NULLIF(current_setting('app.actor_id', true), ''), 'system');
	v_row_id text;
BEGIN
	IF (TG_OP = 'DELETE') THEN
		v_row_id := OLD.id::text;
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, v_row_id, TG_OP, to_jsonb(OLD), NULL);
		RETURN OLD;
	ELSIF (TG_OP = 'UPDATE') THEN
		v_row_id := NEW.id::text;
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, v_row_id, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
		RETURN NEW;
	ELSE
		v_row_id := NEW.id::text;
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, v_row_id, TG_OP, NULL, to_jsonb(NEW));
		RETURN NEW;
	END IF;
END;
$$ LANGUAGE plpgsql;

-- Audit the sample `item` table out of the box.
DROP TRIGGER IF EXISTS item_audit ON item;
CREATE TRIGGER item_audit
	AFTER INSERT OR UPDATE OR DELETE ON item
	FOR EACH ROW EXECUTE FUNCTION record_audit();

-- Audit the key Incluvo domain tables. These hold tenant/role data, coachplan
-- content for (deels) minderjarige leerlingen, grading, chat and notifications,
-- so every change must be attributable (AVG / accountability).
DO $$
DECLARE
	t text;
	audited_tables text[] := ARRAY[
		-- Multi-tenant & roles
		'organization', 'membership', 'coach_assignment',
		-- Coachplan / formulieren (#8–#21)
		'form_template', 'form_question', 'form_assignment',
		'form_submission', 'form_answer', 'answer_coach_mapping',
		'learning_preference_label', 'transcription',
		-- Online cursus (#23–#36, #61)
		'course', 'course_section', 'content_block', 'content_block_label',
		'assignment', 'assignment_submission', 'assignment_grade',
		'content_progress', 'proposed_assignment',
		-- Takenlijst (#37–#41)
		'task',
		-- Chat (#5–#7)
		'conversation', 'conversation_member', 'message',
		-- Notificaties (#3)
		'notification'
	];
BEGIN
	FOREACH t IN ARRAY audited_tables LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
		EXECUTE format(
			'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I '
			|| 'FOR EACH ROW EXECUTE FUNCTION record_audit()',
			t || '_audit', t
		);
	END LOOP;
END;
$$;
