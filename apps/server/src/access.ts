/**
 * Server side of the leerling access rule (`canAccessLeerling`, fix plan 1.1).
 * Every procedure that reads or writes a leerling's data goes through
 * `requireLeerlingAccess` with the leerling id taken from the loaded row (a
 * course, submission, plan …), never trusting a client-supplied id alone.
 */
import { coachAssignment, user } from "@incluvo/drizzle/schema";
import {
	canAccessLeerling,
	isSuperadmin,
	type LeerlingLink,
} from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { AuthedContext } from "./procedures/base";

export interface LeerlingRow extends LeerlingLink {
	id: string;
	name: string;
	email: string;
	organizationId: string | null;
	role: string;
}

/** Load a user with their assigned coaches. Null when the user doesn't exist. */
export async function loadLeerling(
	context: AuthedContext,
	leerlingId: string,
): Promise<LeerlingRow | null> {
	const [row] = await context.db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			organizationId: user.organizationId,
			role: user.role,
		})
		.from(user)
		.where(eq(user.id, leerlingId));
	if (!row) return null;
	const coaches = await context.db
		.select({ coachId: coachAssignment.coachId })
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId));
	return { ...row, leerlingId: row.id, coachIds: coaches.map((c) => c.coachId) };
}

/** Whether the actor may see/change this leerling's data. */
export async function canReachLeerling(
	context: AuthedContext,
	leerlingId: string,
): Promise<boolean> {
	if (leerlingId === context.actor.userId) return true;
	const row = await loadLeerling(context, leerlingId);
	return !!row && row.role === "leerling" && canAccessLeerling(context.actor, row);
}

/**
 * Assert the actor may see/change this leerling's data and return the
 * leerling. NOT_FOUND when the id isn't a leerling (acting on yourself is
 * always allowed); FORBIDDEN when the rule says no.
 */
export async function requireLeerlingAccess(
	context: AuthedContext,
	leerlingId: string,
): Promise<LeerlingRow> {
	const row = await loadLeerling(context, leerlingId);
	const isSelf = leerlingId === context.actor.userId;
	if (!row || (!isSelf && row.role !== "leerling")) {
		throw new ORPCError("NOT_FOUND", { message: "Leerling niet gevonden" });
	}
	if (!canAccessLeerling(context.actor, row)) {
		throw new ORPCError("FORBIDDEN", { message: "Geen toegang tot deze leerling" });
	}
	return row;
}

/**
 * Which leerlingen a list endpoint may show the actor, as a SQL condition on
 * a leerling-id column (and, for a keyuser, the matching organization column).
 * Mirrors `canAccessLeerling`: superadmin → all, keyuser → their school,
 * coach → assigned leerlingen, anyone else → only themselves.
 */
export async function reachableLeerlingen(
	context: AuthedContext,
	leerlingIdColumn: PgColumn,
	organizationIdColumn: PgColumn,
): Promise<SQL> {
	const { actor } = context;
	if (isSuperadmin(actor.role)) return sql`true`;
	if (actor.role === "keyuser" && actor.organizationId) {
		return eq(organizationIdColumn, actor.organizationId);
	}
	if (actor.role === "coach") {
		const links = await context.db
			.select({ leerlingId: coachAssignment.leerlingId })
			.from(coachAssignment)
			.where(eq(coachAssignment.coachId, actor.userId));
		const ids = [...new Set(links.map((l) => l.leerlingId))];
		if (actor.organizationId && ids.length > 0) {
			return and(
				inArray(leerlingIdColumn, ids),
				eq(organizationIdColumn, actor.organizationId),
			)!;
		}
		return sql`false`;
	}
	return eq(leerlingIdColumn, actor.userId);
}
