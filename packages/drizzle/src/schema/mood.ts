import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./better-auth";
import { organization } from "./organization";

/**
 * Dagelijkse mood check-in — "mood delen met je coach".
 *
 * A leerling records how they feel today on a 0–4 scale and *explicitly* chooses
 * whether their coach may see it (`shareWithCoach`). Wellbeing data over minors:
 * sharing is opt-in per check-in and defaults OFF, so a coach only ever reads
 * rows where `shareWithCoach = true`. One row per leerling per day (`UNIQUE
 * (leerling_id, date)`); a re-check overwrites the same day's row.
 */
export const moodCheckin = pgTable(
	"mood_checkin",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// The leerling this check-in belongs to.
		leerlingId: text("leerling_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// The calendar day of the check-in.
		date: date("date").notNull(),
		// Mood on a 0–4 scale (see MOODS in apps/web/src/lib/mood.ts).
		mood: smallint("mood").notNull(),
		// Opt-in per check-in; defaults OFF (minors' wellbeing data).
		shareWithCoach: boolean("share_with_coach").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		// One check-in per leerling per day; a re-check upserts this row.
		unique("mood_checkin_leerling_date_uq").on(t.leerlingId, t.date),
		// Mood is a 0–4 scale.
		check("mood_checkin_mood_range", sql`${t.mood} >= 0 AND ${t.mood} <= 4`),
	],
);

export type MoodCheckin = typeof moodCheckin.$inferSelect;
export type NewMoodCheckin = typeof moodCheckin.$inferInsert;

export const moodCheckinRelations = relations(moodCheckin, ({ one }) => ({
	organization: one(organization, {
		fields: [moodCheckin.organizationId],
		references: [organization.id],
	}),
	leerling: one(user, {
		fields: [moodCheckin.leerlingId],
		references: [user.id],
	}),
}));
