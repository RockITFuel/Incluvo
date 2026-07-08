import { coachAssignment, moodCheckin, user } from "@incluvo/drizzle/schema";
import { isSuperadmin, policies, sameTenant } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	type AuthedContext,
	base,
	ownTenant,
	protectedProcedure,
	withPolicy,
} from "../base";

/**
 * Mood check-in domain — "mood delen met je coach". Register key: `mood`.
 *
 * A leerling does a daily mood check-in (0–4) and explicitly chooses whether the
 * coach may see it. Wellbeing data over minors: sharing is opt-in per check-in
 * and defaults OFF, so a coach only ever reads rows where `shareWithCoach` is
 * true. A leerling reads/writes only their own row for today (`checkin`,
 * `today`). Coach reads (`weekFor`, `todayForLeerlingen`) are gated coach+,
 * tenant-scoped, and re-assert the coach↔leerling assignment exactly like the
 * dashboard procedures, and never return unshared rows.
 *
 * Writes are audited automatically by the DB audit trigger (the actor is pinned
 * on the connection via `acquireRequestActor` in `protectedProcedure`), so — as
 * with `tasks.add` — there is no manual audit call here.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's calendar day as "YYYY-MM-DD" in the server's local timezone. */
function todayStr(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** The "YYYY-MM-DD" for `n` days before today (server-local). */
function daysAgoStr(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

/**
 * Assert the leerling is assigned to this coach within the tenant — a verbatim
 * copy of the dashboard's `assertAssigned`. Loads the leerling so cross-tenant
 * access is rejected even for the superadmin's own-tenant safety, then (for
 * non-superadmins) requires a `coach_assignment` linking actor→leerling.
 */
async function assertAssigned(context: AuthedContext, leerlingId: string) {
	const { actor } = context;
	const [leerling] = await context.db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			organizationId: user.organizationId,
		})
		.from(user)
		.where(eq(user.id, leerlingId));
	if (!leerling) throw new ORPCError("NOT_FOUND");
	if (!sameTenant(actor, leerling)) throw new ORPCError("FORBIDDEN");
	if (!isSuperadmin(actor.role)) {
		const [link] = await context.db
			.select({ id: coachAssignment.id })
			.from(coachAssignment)
			.where(
				and(
					eq(coachAssignment.coachId, actor.userId),
					eq(coachAssignment.leerlingId, leerlingId),
				),
			);
		if (!link) {
			throw new ORPCError("FORBIDDEN", {
				message: "Leerling is niet aan jou gekoppeld",
			});
		}
	}
	return leerling;
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const CheckinSchema = z.object({
	id: z.string(),
	leerlingId: z.string(),
	date: z.string(),
	mood: z.number().int(),
	shareWithCoach: z.boolean(),
});

const checkinColumns = {
	id: moodCheckin.id,
	leerlingId: moodCheckin.leerlingId,
	date: moodCheckin.date,
	mood: moodCheckin.mood,
	shareWithCoach: moodCheckin.shareWithCoach,
} as const;

// ---------------------------------------------------------------------------
// checkin — leerling upserts today's own row
// ---------------------------------------------------------------------------

const checkin = protectedProcedure
	.route({ method: "POST", path: "/mood/checkin", tags: ["mood"] })
	.input(
		z.object({
			mood: z.number().int().min(0).max(4),
			shareWithCoach: z.boolean(),
		}),
	)
	.output(CheckinSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		if (!actor.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Gebruiker heeft geen organisatie",
			});
		}
		const date = todayStr();
		const [row] = await context.db
			.insert(moodCheckin)
			.values({
				organizationId: actor.organizationId,
				leerlingId: actor.userId,
				date,
				mood: input.mood,
				shareWithCoach: input.shareWithCoach,
			})
			.onConflictDoUpdate({
				target: [moodCheckin.leerlingId, moodCheckin.date],
				set: {
					mood: input.mood,
					shareWithCoach: input.shareWithCoach,
					updatedAt: new Date(),
				},
			})
			.returning(checkinColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return row;
	});

// ---------------------------------------------------------------------------
// today — leerling reads today's own check-in (or null)
// ---------------------------------------------------------------------------

const today = protectedProcedure
	.route({ method: "GET", path: "/mood/today", tags: ["mood"] })
	.output(CheckinSchema.nullable())
	.handler(async ({ context }) => {
		const { actor } = context;
		const [row] = await context.db
			.select(checkinColumns)
			.from(moodCheckin)
			.where(
				and(
					eq(moodCheckin.leerlingId, actor.userId),
					eq(moodCheckin.date, todayStr()),
				),
			);
		return row ?? null;
	});

// ---------------------------------------------------------------------------
// weekFor — coach reads a leerling's last 7 days of SHARED moods (#coach)
// ---------------------------------------------------------------------------

const weekFor = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({ method: "GET", path: "/mood/week/{leerlingId}", tags: ["mood"] })
	.input(z.object({ leerlingId: z.string() }))
	.output(z.array(z.object({ date: z.string(), mood: z.number().int() })))
	.handler(async ({ input, context }) => {
		const leerling = await assertAssigned(context, input.leerlingId);
		// Last 7 days incl. today; never return rows where sharing is off.
		const rows = await context.db
			.select({ date: moodCheckin.date, mood: moodCheckin.mood })
			.from(moodCheckin)
			.where(
				and(
					eq(moodCheckin.leerlingId, leerling.id),
					eq(moodCheckin.shareWithCoach, true),
					gte(moodCheckin.date, daysAgoStr(6)),
				),
			);
		return rows;
	});

// ---------------------------------------------------------------------------
// todayForLeerlingen — coach reads today's SHARED mood per assigned leerling
// ---------------------------------------------------------------------------

const todayForLeerlingen = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({ method: "GET", path: "/mood/today-leerlingen", tags: ["mood"] })
	.output(z.array(z.object({ leerlingId: z.string(), mood: z.number().int() })))
	.handler(async ({ context }) => {
		const { actor } = context;

		// Assigned leerlingen for this coach (superadmin: all in tenant) — the
		// same assignment join as dashboard.overview.
		let leerlingIds: string[];
		if (isSuperadmin(actor.role)) {
			const rows = await context.db
				.select({ id: user.id, organizationId: user.organizationId })
				.from(user)
				.where(eq(user.role, "leerling"));
			leerlingIds = rows.filter((l) => sameTenant(actor, l)).map((l) => l.id);
		} else {
			const rows = await context.db
				.select({ id: user.id, organizationId: user.organizationId })
				.from(coachAssignment)
				.innerJoin(user, eq(user.id, coachAssignment.leerlingId))
				.where(eq(coachAssignment.coachId, actor.userId));
			leerlingIds = rows.filter((l) => sameTenant(actor, l)).map((l) => l.id);
		}
		if (leerlingIds.length === 0) return [];

		// Today's shared moods only; never return unshared rows.
		const rows = await context.db
			.select({
				leerlingId: moodCheckin.leerlingId,
				mood: moodCheckin.mood,
			})
			.from(moodCheckin)
			.where(
				and(
					inArray(moodCheckin.leerlingId, leerlingIds),
					eq(moodCheckin.date, todayStr()),
					eq(moodCheckin.shareWithCoach, true),
				),
			);
		return rows;
	});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const moodRouter = base.router({
	checkin,
	today,
	weekFor,
	todayForLeerlingen,
});
