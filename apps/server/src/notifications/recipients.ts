import type { Database } from "@incluvo/drizzle";
import { coachAssignment, user } from "@incluvo/drizzle/schema";
import { and, eq } from "drizzle-orm";

/**
 * Who hears about something a leerling did (plan ingeleverd, opdracht
 * ingeleverd, voorstel): their gekoppelde coaches. A leerling without a coach
 * would otherwise notify nobody, so then the school's keyusers hear it — they
 * see every leerling of the school anyway (D1) and can link a coach.
 */
export async function leerlingCoachRecipients(
	db: Database,
	leerlingId: string,
	organizationId: string,
): Promise<string[]> {
	const coaches = await db
		.select({ id: coachAssignment.coachId })
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId));
	if (coaches.length > 0) return [...new Set(coaches.map((c) => c.id))];

	const keyusers = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.organizationId, organizationId), eq(user.role, "keyuser")));
	return keyusers.map((k) => k.id);
}
