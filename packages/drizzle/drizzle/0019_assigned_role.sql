CREATE TABLE "assigned_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assigned_role" ADD CONSTRAINT "assigned_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assigned_role_user_role_uq" ON "assigned_role" USING btree ("user_id","role");--> statement-breakpoint
-- Everyone keeps the role they have; it becomes their first assigned role.
INSERT INTO "assigned_role" ("user_id", "role") SELECT "id", "role" FROM "user";--> statement-breakpoint
-- The active role is always an assigned role: setting `user.role` (a new
-- account, a role change, the seed) assigns it too. Switching to a role the
-- user doesn't have is refused in the app before it gets here.
CREATE FUNCTION "assign_active_role"() RETURNS trigger AS $$
BEGIN
	INSERT INTO "assigned_role" ("user_id", "role") VALUES (NEW."id", NEW."role")
	ON CONFLICT DO NOTHING;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "user_assign_active_role" AFTER INSERT OR UPDATE OF "role" ON "user"
	FOR EACH ROW EXECUTE FUNCTION "assign_active_role"();
