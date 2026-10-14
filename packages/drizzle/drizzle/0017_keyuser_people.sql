CREATE TYPE "public"."coach_assignment_kind" AS ENUM('vast', 'vervanger');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('man', 'vrouw', 'anders', 'onbekend');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('actief', 'inactief');--> statement-breakpoint
CREATE TABLE "person_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"eck_id" text,
	"last_name" text,
	"prefix" text,
	"first_names" text,
	"initials" text,
	"nickname" text,
	"birth_date" date,
	"gender" "gender",
	"username" text,
	"photo_url" text,
	"start_date" date,
	"end_date" date,
	"status" "person_status" DEFAULT 'actief' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD COLUMN "kind" "coach_assignment_kind" DEFAULT 'vast' NOT NULL;--> statement-breakpoint
ALTER TABLE "person_profile" ADD CONSTRAINT "person_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_number_uq" ON "person_profile" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_username_uq" ON "person_profile" USING btree (lower("username")) WHERE "person_profile"."username" is not null;--> statement-breakpoint
CREATE INDEX "person_profile_status_idx" ON "person_profile" USING btree ("status");--> statement-breakpoint
-- INC-16: the keyuser no longer coaches; only a coach can be in a koppeling.
DELETE FROM "coach_assignment" a USING "user" u
WHERE u.id = a.coach_id AND u.role <> 'coach';--> statement-breakpoint
-- INC-18: per leerling the oldest koppeling is the vaste coach, the next one the
-- vervanger. A leerling can't have more than those two any more.
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY leerling_id ORDER BY created_at, id) AS rn
	FROM "coach_assignment"
)
DELETE FROM "coach_assignment" a USING ranked r WHERE a.id = r.id AND r.rn > 2;--> statement-breakpoint
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY leerling_id ORDER BY created_at, id) AS rn
	FROM "coach_assignment"
)
UPDATE "coach_assignment" a SET kind = 'vervanger' FROM ranked r WHERE a.id = r.id AND r.rn = 2;--> statement-breakpoint
-- Every leerling and coach gets a profile, numbered in order of joining.
INSERT INTO "person_profile" (user_id, start_date)
SELECT id, created_at::date FROM "user"
WHERE role IN ('leerling', 'coach')
ORDER BY created_at, id;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_assignment_kind_uq" ON "coach_assignment" USING btree ("leerling_id","kind");