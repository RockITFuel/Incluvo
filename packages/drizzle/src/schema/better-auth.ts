import { relations } from "drizzle-orm";
import {
	boolean,
	pgTable,
	uniqueIndex,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organization, userRole } from "./organization";

/**
 * Tables required by better-auth's Drizzle adapter.
 * Keep column names in sync with better-auth's expected schema.
 */

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	// The active role, mirrored onto the session for fast access checks: the
	// @incluvo/permissions UserRole (leerling … superadmin). Always one of the
	// user's `assigned_role` rows; switching roles changes it (INC-24), so it
	// is also the role a user comes back to after signing in again.
	role: userRole("role").notNull().default("leerling"),
	// Tenant the user belongs to (multi-tenant, QUESTIONS 3.x).
	// ASSUMPTION: one user belongs to exactly one tenant for now (QUESTIONS 3.2).
	organizationId: uuid("organization_id").references(() => organization.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Every role a user has (INC-24). Someone can be keyuser and coach with one
 * account and switch between them; `user.role` is the active one. A leerling
 * or superadmin has only that role (see `apps/server/src/roles.ts`).
 */
export const assignedRole = pgTable(
	"assigned_role",
	{
		// Own id so the audit trigger can record who got or lost a role.
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: userRole("role").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [uniqueIndex("assigned_role_user_role_uq").on(t.userId, t.role)],
);

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	idToken: text("id_token"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;

export const userRelations = relations(user, ({ one }) => ({
	organization: one(organization, {
		fields: [user.organizationId],
		references: [organization.id],
	}),
}));
