import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Multi-tenant model. A tenant is an `organization`: either Ondivera (the
 * platform owner, kind = "ondivera") or a school/klant (kind = "school").
 *
 * Werkaanname (QUESTIONS 3.x): hierarchy is
 *   Ondivera (superadmin) > School/Klant (keyuser beheert) > Coach/docent + Leerling.
 * "Ontwikkelaar" is modelled as a role/right for building courses.
 *
 * ASSUMPTION (QUESTIONS 3.2 open): one user belongs to exactly one tenant for
 * now. A user's `organizationId` (on the `user` table) is the single tenant.
 * The `membership` table records the explicit role link and leaves room to
 * relax this to many-to-many later without a breaking change.
 */

export const organizationKind = pgEnum("organization_kind", [
	"ondivera",
	"school",
]);

export const organization = pgTable("organization", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	kind: organizationKind("kind").notNull().default("school"),
	// Self-FK: a school is administered under the Ondivera root tenant.
	// ASSUMPTION: there is a single Ondivera root org; schools reference it.
	parentId: uuid("parent_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Application role within the tenant hierarchy. Ordered (loosely) from least to
 * most privileged for hierarchical checks in @incluvo/permissions:
 *   leerling < ontwikkelaar < coach < keyuser < superadmin.
 * `ontwikkelaar` is the course-builder right (#25–#36).
 */
export const userRole = pgEnum("user_role", [
	"leerling",
	"ontwikkelaar",
	"coach",
	"keyuser",
	"superadmin",
]);

export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;

export const organizationRelations = relations(
	organization,
	({ one, many }) => ({
		parent: one(organization, {
			fields: [organization.parentId],
			references: [organization.id],
			relationName: "organizationParent",
		}),
		children: many(organization, { relationName: "organizationParent" }),
	}),
);
