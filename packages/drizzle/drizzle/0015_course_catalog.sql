CREATE TABLE "course_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "course_category_link" (
	"course_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_school_availability" (
	"course_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "available_to_all_schools" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_category_link" ADD CONSTRAINT "course_category_link_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_category_link" ADD CONSTRAINT "course_category_link_category_id_course_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_school_availability" ADD CONSTRAINT "course_school_availability_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_school_availability" ADD CONSTRAINT "course_school_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_category_link_uq" ON "course_category_link" USING btree ("course_id","category_id");--> statement-breakpoint
CREATE INDEX "course_category_link_category_idx" ON "course_category_link" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_school_availability_uq" ON "course_school_availability" USING btree ("course_id","organization_id");--> statement-breakpoint
CREATE INDEX "course_school_availability_org_idx" ON "course_school_availability" USING btree ("organization_id");--> statement-breakpoint
-- Existing Ondivera templates were open to every school; keep it that way.
UPDATE "course" SET "available_to_all_schools" = true WHERE "kind" = 'ondivera_template';
