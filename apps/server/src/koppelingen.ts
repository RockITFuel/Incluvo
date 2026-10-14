/**
 * Koppelingen coach ↔ leerling (INC-18). A leerling has one vaste coach and,
 * while that coach is away, at most one vervanger — another person. Both reach
 * the leerling the same way (`canAccessLeerling`); ending the vervanging only
 * takes away what the vervanger got from it. Only the keyuser (or Ondivera)
 * changes koppelingen; every change runs in one transaction, so a refused or
 * failed change leaves the old koppelingen as they were.
 */
import type { Database } from "@incluvo/drizzle";
import { coachAssignment, user } from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

export type KoppelingKind = "vast" | "vervanger";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Both people exist, in the same school, as a coach and a leerling. */
async function loadPair(tx: Tx, coachId: string, leerlingId: string, organizationId: string) {
	const rows = await tx
		.select({ id: user.id, role: user.role, organizationId: user.organizationId })
		.from(user)
		.where(inArray(user.id, [coachId, leerlingId]));
	const coach = rows.find((r) => r.id === coachId);
	const leerling = rows.find((r) => r.id === leerlingId);
	if (!coach || !leerling) throw new ORPCError("NOT_FOUND");
	if (coach.role !== "coach" || leerling.role !== "leerling") {
		throw new ORPCError("BAD_REQUEST", { message: "Koppel een coach aan een leerling" });
	}
	if (coach.organizationId !== organizationId || leerling.organizationId !== organizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Coach en leerling horen niet bij dezelfde school",
		});
	}
}

async function koppelingenOf(tx: Tx, leerlingId: string) {
	// Locked, so two keyusers changing the same leerling can't cross.
	const rows = await tx
		.select({ id: coachAssignment.id, coachId: coachAssignment.coachId, kind: coachAssignment.kind })
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId))
		.for("update");
	return {
		vast: rows.find((r) => r.kind === "vast") ?? null,
		vervanger: rows.find((r) => r.kind === "vervanger") ?? null,
	};
}

async function assertLeerlingInSchool(tx: Tx, leerlingId: string, organizationId: string) {
	const [leerling] = await tx
		.select({ role: user.role, organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, leerlingId));
	if (!leerling) throw new ORPCError("NOT_FOUND");
	if (leerling.role !== "leerling" || leerling.organizationId !== organizationId) {
		throw new ORPCError("BAD_REQUEST", { message: "Deze leerling hoort niet bij je school" });
	}
}

/**
 * Set (or with `coachId: null`, end) the vaste coach or the vervanger of a
 * leerling within `organizationId`.
 */
export async function setKoppeling(
	db: Database,
	input: { organizationId: string; leerlingId: string; kind: KoppelingKind; coachId: string | null },
): Promise<void> {
	await db.transaction(async (tx) => {
		const { organizationId, leerlingId, kind, coachId } = input;
		if (coachId) await loadPair(tx, coachId, leerlingId, organizationId);
		else await assertLeerlingInSchool(tx, leerlingId, organizationId);
		const current = await koppelingenOf(tx, leerlingId);
		const other = kind === "vast" ? current.vervanger : current.vast;
		const mine = kind === "vast" ? current.vast : current.vervanger;

		if (!coachId) {
			if (kind === "vast" && current.vervanger) {
				throw new ORPCError("CONFLICT", {
					message: "Beëindig eerst de vervanging, of kies een nieuwe vaste coach.",
				});
			}
			if (mine) await tx.delete(coachAssignment).where(eq(coachAssignment.id, mine.id));
			return;
		}
		if (other?.coachId === coachId) {
			throw new ORPCError("CONFLICT", {
				message:
					kind === "vast"
						? "Deze coach is nu de vervanger van de leerling. Beëindig eerst de vervanging."
						: "De vervanger moet iemand anders zijn dan de vaste coach.",
			});
		}
		if (kind === "vervanger" && !current.vast) {
			throw new ORPCError("CONFLICT", {
				message: "Koppel eerst een vaste coach; een vervanger komt daarbij.",
			});
		}
		if (mine?.coachId === coachId) return;
		if (mine) await tx.delete(coachAssignment).where(eq(coachAssignment.id, mine.id));
		await tx.insert(coachAssignment).values({ organizationId, coachId, leerlingId, kind });
	});
}

/**
 * The older on/off switch (Beheer → Koppelingen): linking a coach makes them
 * the vaste coach, or the vervanger when there already is one; unlinking the
 * vaste coach makes the vervanger the vaste coach.
 */
export async function toggleKoppeling(
	db: Database,
	input: { organizationId: string; leerlingId: string; coachId: string; assigned: boolean },
): Promise<void> {
	await db.transaction(async (tx) => {
		const { organizationId, leerlingId, coachId } = input;
		await loadPair(tx, coachId, leerlingId, organizationId);
		const current = await koppelingenOf(tx, leerlingId);
		const linked = [current.vast, current.vervanger].find((k) => k?.coachId === coachId);

		if (input.assigned) {
			if (linked) return;
			if (current.vast && current.vervanger) {
				throw new ORPCError("CONFLICT", {
					message: "Deze leerling heeft al een vaste coach en een vervanger.",
				});
			}
			await tx.insert(coachAssignment).values({
				organizationId,
				coachId,
				leerlingId,
				kind: current.vast ? "vervanger" : "vast",
			});
			return;
		}
		if (!linked) return;
		await tx.delete(coachAssignment).where(eq(coachAssignment.id, linked.id));
		if (linked.kind === "vast" && current.vervanger) {
			await tx
				.update(coachAssignment)
				.set({ kind: "vast", updatedAt: new Date() })
				.where(and(eq(coachAssignment.id, current.vervanger.id)));
		}
	});
}
