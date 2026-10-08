import { relations, sql } from "drizzle-orm";
import { date, index, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./better-auth";

/** Whether a leerling or coach is in use at the school (INC-15/16). */
export const personStatus = pgEnum("person_status", ["actief", "inactief"]);

/** Geslacht as the school records it; optional. */
export const gender = pgEnum("gender", ["man", "vrouw", "anders", "onbekend"]);

/**
 * The school's administration of a leerling or coach (INC-15, INC-17), next to
 * the login account in `user`. `number` is the ID the keyuser sees: made by the
 * system, never edited. `startDate`/`endDate` are the leerling's start- and
 * stopdatum Incluvo, or the coach's in- and uitdienst datum. `user.name` holds
 * the display name built from roepnaam, voorvoegsel and achternaam.
 */
export const personProfile = pgTable(
	"person_profile",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		number: serial("number").notNull(),
		eckId: text("eck_id"),
		lastName: text("last_name"),
		prefix: text("prefix"),
		firstNames: text("first_names"),
		initials: text("initials"),
		nickname: text("nickname"),
		birthDate: date("birth_date"),
		gender: gender("gender"),
		username: text("username"),
		photoUrl: text("photo_url"),
		startDate: date("start_date"),
		endDate: date("end_date"),
		status: personStatus("status").notNull().default("actief"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("person_profile_number_uq").on(t.number),
		uniqueIndex("person_profile_username_uq")
			.on(sql`lower(${t.username})`)
			.where(sql`${t.username} is not null`),
		index("person_profile_status_idx").on(t.status),
	],
);

export type PersonProfile = typeof personProfile.$inferSelect;

export const personProfileRelations = relations(personProfile, ({ one }) => ({
	user: one(user, { fields: [personProfile.userId], references: [user.id] }),
}));
