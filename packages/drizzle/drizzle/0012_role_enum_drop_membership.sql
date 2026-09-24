-- 2.5 role model.
-- 1. `membership` was written everywhere but never read (the role lives on
--    `user.role`); drop it.
DROP TABLE "membership" CASCADE;--> statement-breakpoint
-- 2. `user.role` becomes the `user_role` enum. Legacy values: "admin" already
--    counted as superadmin in every check; "member" only exists on
--    self-registered accounts without a school, which as a leerling without a
--    school reach nothing but their own data.
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
UPDATE "user" SET role = 'superadmin' WHERE role = 'admin';--> statement-breakpoint
UPDATE "user" SET role = 'leerling' WHERE role NOT IN ('leerling', 'ontwikkelaar', 'coach', 'keyuser', 'superadmin');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'leerling'::"public"."user_role";
