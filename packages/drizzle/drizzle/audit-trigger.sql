-- Audit trigger: writes an append-only audit_log row on every change to an
-- audited table, attributing it to the per-request actor pinned in the
-- `app.actor_id` GUC (set by acquireRequestActor in src/client.ts).
--
-- Apply after `drizzle-kit push`/`migrate`:
--   psql "$DATABASE_URL" -f drizzle/audit-trigger.sql
--
-- Attach to a table with:
--   CREATE TRIGGER <table>_audit
--     AFTER INSERT OR UPDATE OR DELETE ON <table>
--     FOR EACH ROW EXECUTE FUNCTION record_audit();

-- What an audit row keeps of a table row (`mode`, the trigger argument):
--   full          the whole row (default)
--   keys_only     the id and, on UPDATE, the names of the changed columns —
--                 for tables with pupils' free text (chat, answers,
--                 transcripts…), so deleting that data under the AVG doesn't
--                 leave a copy in the audit log
--   only:a,b      like keys_only, plus the values of columns a and b
CREATE OR REPLACE FUNCTION audit_snapshot(r jsonb, other jsonb, mode text)
RETURNS jsonb AS $$
DECLARE
	keep text[] := '{}';
	snap jsonb;
BEGIN
	IF r IS NULL THEN
		RETURN NULL;
	END IF;
	IF mode IS NULL OR mode = 'full' THEN
		RETURN r;
	END IF;
	IF mode LIKE 'only:%' THEN
		keep := string_to_array(substr(mode, 6), ',');
	END IF;
	snap := jsonb_build_object('id', r -> 'id');
	snap := snap || COALESCE(
		(SELECT jsonb_object_agg(k, r -> k) FROM unnest(keep) AS k WHERE r ? k),
		'{}'::jsonb
	);
	IF other IS NOT NULL THEN
		snap := snap || jsonb_build_object('changed', COALESCE(
			(SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(r) AS k
				WHERE (r -> k) IS DISTINCT FROM (other -> k)),
			'[]'::jsonb
		));
	END IF;
	RETURN snap;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION record_audit() RETURNS trigger AS $$
DECLARE
	v_actor text := COALESCE(NULLIF(current_setting('app.actor_id', true), ''), 'system');
	v_mode text := COALESCE(TG_ARGV[0], 'full');
	v_old jsonb;
	v_new jsonb;
BEGIN
	IF (TG_OP = 'DELETE') THEN
		v_old := to_jsonb(OLD);
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, OLD.id::text, TG_OP,
			audit_snapshot(v_old, NULL, v_mode), NULL);
		RETURN OLD;
	ELSIF (TG_OP = 'UPDATE') THEN
		v_old := to_jsonb(OLD);
		v_new := to_jsonb(NEW);
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, NEW.id::text, TG_OP,
			audit_snapshot(v_old, v_new, v_mode), audit_snapshot(v_new, v_old, v_mode));
		RETURN NEW;
	ELSE
		v_new := to_jsonb(NEW);
		INSERT INTO audit_log (actor, table_name, row_id, operation, before, after)
		VALUES (v_actor, TG_TABLE_NAME, NEW.id::text, TG_OP,
			NULL, audit_snapshot(v_new, NULL, v_mode));
		RETURN NEW;
	END IF;
END;
$$ LANGUAGE plpgsql;

-- Audit the key Incluvo domain tables. These hold tenant/role data, coachplan
-- content for (deels) minderjarige leerlingen, grading, chat and notifications,
-- so every change must be attributable (AVG / accountability).
DO $$
DECLARE
	t text;
	-- table => what the audit row keeps (see audit_snapshot)
	audited jsonb := jsonb_build_object(
		-- Multi-tenant & roles. For `user` only role + organization: who became
		-- what where (no e-mail/name copies).
		'user', 'only:role,organization_id',
		'organization', 'full', 'coach_assignment', 'full',
		-- Coachplan / formulieren (#8–#21)
		'form_template', 'full', 'form_question', 'full', 'form_assignment', 'full',
		'coachplan', 'full', 'form_submission', 'full',
		'form_answer', 'keys_only', 'answer_coach_mapping', 'keys_only',
		'learning_preference_label', 'keys_only', 'transcription', 'keys_only',
		-- Online cursus (#23–#36, #61)
		'course', 'full', 'course_section', 'full', 'content_block', 'full',
		'content_block_label', 'full', 'assignment', 'full',
		'assignment_submission', 'keys_only', 'assignment_grade', 'keys_only',
		'content_progress', 'full', 'proposed_assignment', 'keys_only',
		-- Takenlijst (#37–#41)
		'task', 'full',
		-- Chat (#5–#7)
		'conversation', 'full', 'conversation_member', 'full', 'message', 'keys_only',
		-- Notificaties (#3)
		'notification', 'keys_only'
	);
BEGIN
	FOR t IN SELECT jsonb_object_keys(audited) LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
		EXECUTE format(
			'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I '
			|| 'FOR EACH ROW EXECUTE FUNCTION record_audit(%L)',
			t || '_audit', t, audited ->> t
		);
	END LOOP;
END;
$$;
