CREATE TABLE "mood_checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"leerling_id" text NOT NULL,
	"date" date NOT NULL,
	"mood" smallint NOT NULL,
	"share_with_coach" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mood_checkin_leerling_date_uq" UNIQUE("leerling_id","date"),
	CONSTRAINT "mood_checkin_mood_range" CHECK ("mood_checkin"."mood" >= 0 AND "mood_checkin"."mood" <= 4)
);
--> statement-breakpoint
ALTER TABLE "mood_checkin" ADD CONSTRAINT "mood_checkin_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_checkin" ADD CONSTRAINT "mood_checkin_leerling_id_user_id_fk" FOREIGN KEY ("leerling_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;