-- D3: a course copy belongs to one leerling, so course forums (#32) and group
-- assignments had no classmates. Forum blocks go; their chat conversations
-- stay (members can still read them) but are unlinked first, because the
-- foreign key would otherwise cascade-delete the pupils' messages.
UPDATE "conversation" SET course_content_block_id = NULL
WHERE course_content_block_id IN (SELECT id FROM "content_block" WHERE type = 'forum');--> statement-breakpoint
DELETE FROM "content_block" WHERE type = 'forum';--> statement-breakpoint
ALTER TABLE "content_block" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_block_type";--> statement-breakpoint
CREATE TYPE "public"."content_block_type" AS ENUM('opdracht', 'pagina', 'bestand', 'youtube', 'lti');--> statement-breakpoint
ALTER TABLE "content_block" ALTER COLUMN "type" SET DATA TYPE "public"."content_block_type" USING "type"::"public"."content_block_type";--> statement-breakpoint
ALTER TABLE "assignment" DROP COLUMN "is_group";