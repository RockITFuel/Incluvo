-- One "done" state for course work (fix plan 2.3): an opdracht is done once it
-- has been handed in. Bring existing data in line: tasks and block progress of
-- opdrachten with a submission become done/completed.
UPDATE "task" t
SET done = true, done_at = COALESCE(t.done_at, s.first_at), updated_at = now()
FROM (
	SELECT assignment_id, leerling_id, min(COALESCE(submitted_at, created_at)) AS first_at
	FROM "assignment_submission" GROUP BY assignment_id, leerling_id
) s
WHERE t.assignment_id = s.assignment_id AND t.leerling_id = s.leerling_id AND NOT t.done;--> statement-breakpoint
INSERT INTO "content_progress" (content_block_id, leerling_id, completed, completed_at)
SELECT a.content_block_id, s.leerling_id, true, min(COALESCE(s.submitted_at, s.created_at))
FROM "assignment_submission" s
JOIN "assignment" a ON a.id = s.assignment_id
GROUP BY a.content_block_id, s.leerling_id
ON CONFLICT (leerling_id, content_block_id)
DO UPDATE SET completed = true, completed_at = COALESCE(content_progress.completed_at, EXCLUDED.completed_at), updated_at = now();
