/**
 * Several roles per account (INC-24). `assigned_role` holds every role a user
 * has; `user.role` is the active one, and everything that asks "what may the
 * signed-in user do" keeps reading that (the session, `context.actor`). A
 * switch only changes the active role, to one the user has.
 *
 * Asking about someone else ("is this person a coach?") must look at all their
 * roles, not at the role they happen to be working in: use `hasRole`.
 *
 * A leerling is only a leerling, and the superadmin (Ondivera, no school) only
 * superadmin. The school roles — ontwikkelaar, coach, keyuser — combine freely.
 */
import type { Database } from "@incluvo/drizzle";
import { assignedRole, coachAssignment, personProfile, user } from "@incluvo/drizzle/schema";
import { ROLES, rolesCombine, type UserRole } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Roles in the fixed `ROLES` order, without duplicates. */
export function sortRoles(roles: readonly UserRole[]): UserRole[] {
	return ROLES.filter((r) => roles.includes(r));
}

/** Refuses an empty set, or a leerling/superadmin role combined with another. */
export function assertValidRoleSet(roles: readonly UserRole[]): void {
	if (roles.length === 0) {
		throw new ORPCError("BAD_REQUEST", { message: "Kies minstens één rol." });
	}
	if (!rolesCombine(roles)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Een leerling of superadmin kan geen andere rollen hebben.",
		});
	}
}

/** SQL condition: the user in `userId` (default `user.id`) has `role`. */
export function hasRole(role: UserRole, userId: SQL | typeof user.id = user.id): SQL {
	return sql`exists (select 1 from ${assignedRole} where ${assignedRole.userId} = ${userId} and ${assignedRole.role} = ${role})`;
}

/** All roles of a user, in `ROLES` order. */
export async function rolesOf(db: Database | Tx, userId: string): Promise<UserRole[]> {
	const rows = await db
		.select({ role: assignedRole.role })
		.from(assignedRole)
		.where(eq(assignedRole.userId, userId));
	return sortRoles(rows.map((r) => r.role));
}

/** Roles per user, for lists. Users without rows get none. */
export async function rolesByUser(
	db: Database | Tx,
	userIds: string[],
): Promise<Map<string, UserRole[]>> {
	const out = new Map<string, UserRole[]>();
	if (userIds.length === 0) return out;
	const rows = await db
		.select({ userId: assignedRole.userId, role: assignedRole.role })
		.from(assignedRole)
		.where(inArray(assignedRole.userId, userIds));
	for (const r of rows) out.set(r.userId, [...(out.get(r.userId) ?? []), r.role]);
	for (const [id, roles] of out) out.set(id, sortRoles(roles));
	return out;
}

/**
 * Give a user exactly these roles. The active role stays when it is still
 * among them; otherwise the highest remaining one becomes active (AC11).
 * Koppelingen that no longer fit go: as coach without the coach role, as
 * leerling without the leerling role.
 */
export async function setRoles(tx: Tx, userId: string, roles: readonly UserRole[]): Promise<UserRole> {
	assertValidRoleSet(roles);
	const set = sortRoles(roles);
	const [current] = await tx
		.select({ role: user.role })
		.from(user)
		.where(eq(user.id, userId))
		.for("update");
	if (!current) throw new ORPCError("NOT_FOUND");
	const active = set.includes(current.role) ? current.role : set[set.length - 1]!;
	await tx
		.delete(assignedRole)
		.where(and(eq(assignedRole.userId, userId), notInArray(assignedRole.role, set)));
	await tx
		.insert(assignedRole)
		.values(set.map((role) => ({ userId, role })))
		.onConflictDoNothing();
	if (active !== current.role) {
		await tx.update(user).set({ role: active, updatedAt: new Date() }).where(eq(user.id, userId));
	}
	// Leerlingen and coaches have a school record (and ID), also when the role
	// comes on top of another one.
	if (set.includes("coach") || set.includes("leerling")) {
		await tx.insert(personProfile).values({ userId }).onConflictDoNothing();
	}
	if (!set.includes("coach")) {
		await tx.delete(coachAssignment).where(eq(coachAssignment.coachId, userId));
	}
	if (!set.includes("leerling")) {
		await tx.delete(coachAssignment).where(eq(coachAssignment.leerlingId, userId));
	}
	return active;
}

/** Make one of the user's own roles the active one. */
export async function switchRole(db: Database, userId: string, role: UserRole): Promise<void> {
	await db.transaction(async (tx) => {
		const roles = await rolesOf(tx, userId);
		if (!roles.includes(role)) {
			throw new ORPCError("FORBIDDEN", { message: "Deze rol heb je niet." });
		}
		await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId));
	});
}
