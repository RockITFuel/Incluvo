/**
 * The keyuser's leerlingen- and coachbeheer (INC-15 – INC-18): who is at the
 * school, adding a leerling or coach with their school record, and who
 * coaches whom (vaste coach + vervanger). Only the keyuser of the school; a
 * coach, a leerling or another school's keyuser is refused here, whatever the
 * screen shows.
 */
import { account, coachAssignment, personProfile, user } from "@incluvo/drizzle/schema";
import { policies } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertNotArchived } from "../../access";
import { type KoppelingKind, setKoppeling } from "../../koppelingen";
import { createPerson, sendInvite } from "../../users";
import { type AuthedContext, base, ownTenant, protectedProcedure, withPolicy } from "../base";

/** The keyuser's own school; everyone else is refused. */
function ownSchool(context: AuthedContext): string {
	const { actor } = context;
	if (actor.role !== "keyuser" || !actor.organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message: "Alleen de keyuser van de school beheert leerlingen en coaches",
		});
	}
	return actor.organizationId;
}

const keyuserProcedure = protectedProcedure.use(withPolicy(policies.manageUsers, ownTenant));

// ---------------------------------------------------------------------------
// Input: the fields of the forms, checked here as well as in the browser
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => v || null);

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);

/** A calendar date as YYYY-MM-DD that exists. */
const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Geen geldige datum")
	.refine((v) => {
		const d = new Date(`${v}T00:00:00Z`);
		return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
	}, "Geen geldige datum");

const PersonBase = z.object({
	eckId: optionalText(100),
	lastName: requiredText(100, "Vul de achternaam in"),
	prefix: optionalText(30),
	firstNames: optionalText(150),
	initials: optionalText(30),
	nickname: requiredText(100, "Vul de roepnaam in"),
	username: optionalText(100),
	email: z.string().trim().email("Geen geldig e-mailadres").max(254),
});

const LeerlingInput = PersonBase.extend({
	birthDate: isoDate,
	gender: z.enum(["man", "vrouw", "anders", "onbekend"]).optional(),
	photoUrl: z
		.string()
		.trim()
		.url("Geen geldige link")
		.refine((v) => v.startsWith("https://"), "De link moet met https:// beginnen")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	startDate: isoDate,
	endDate: isoDate.optional(),
})
	.refine((v) => !v.endDate || v.endDate >= v.startDate, {
		message: "De stopdatum kan niet vóór de startdatum liggen",
		path: ["endDate"],
	})
	.refine((v) => v.birthDate < new Date().toISOString().slice(0, 10), {
		message: "De geboortedatum ligt in de toekomst",
		path: ["birthDate"],
	});

const CoachInput = PersonBase.extend({
	startDate: isoDate,
	endDate: isoDate.optional(),
}).refine((v) => !v.endDate || v.endDate >= v.startDate, {
	message: "De uitdienst datum kan niet vóór de indienst datum liggen",
	path: ["endDate"],
});

/** A refusal tied to one form field, so the screen can show it there. */
function fieldError(field: string, message: string): ORPCError<"CONFLICT", { field: string }> {
	return new ORPCError("CONFLICT", { message, data: { field } });
}

/** E-mail and gebruikersnaam must be free; says which one isn't. */
async function assertFree(
	context: AuthedContext,
	organizationId: string,
	input: { email: string; username: string | null },
	role: "leerling" | "coach",
) {
	const [taken] = await context.db
		.select({ role: user.role, organizationId: user.organizationId })
		.from(user)
		.where(eq(user.email, input.email.toLowerCase()));
	if (taken) {
		const here = taken.organizationId === organizationId;
		throw fieldError(
			"email",
			here && taken.role === role
				? `Er is al een ${role} met dit e-mailadres op je school.`
				: "Dit e-mailadres is al in gebruik.",
		);
	}
	if (input.username) {
		const [name] = await context.db
			.select({ userId: personProfile.userId })
			.from(personProfile)
			.where(sql`lower(${personProfile.username}) = lower(${input.username})`);
		if (name) throw fieldError("username", "Deze gebruikersnaam is al in gebruik.");
	}
}

/** Create, then mail the invite; a unique-key race still ends as a clear refusal. */
async function addPerson(
	context: AuthedContext,
	role: "leerling" | "coach",
	input: z.infer<typeof PersonBase> & Record<string, unknown>,
) {
	const organizationId = ownSchool(context);
	await assertNotArchived(context.db, organizationId);
	await assertFree(context, organizationId, input, role);
	const { email, ...profile } = input;
	let created: Awaited<ReturnType<typeof createPerson>>;
	try {
		created = await createPerson({
			email,
			role,
			organizationId,
			profile: profile as Parameters<typeof createPerson>[0]["profile"],
		});
	} catch (error) {
		if ((error as { code?: string }).code === "23505") {
			throw fieldError("email", "Dit e-mailadres of deze gebruikersnaam is al in gebruik.");
		}
		throw error;
	}
	let mailSent = true;
	try {
		await sendInvite({ id: created.id, email: email.toLowerCase(), name: created.name });
	} catch (error) {
		console.error(`[people] invite mail for new ${role} failed`, error);
		mailSent = false;
	}
	return { ...created, mailSent };
}

const CreatedSchema = z.object({
	id: z.string(),
	number: z.number(),
	name: z.string(),
	/** False when the invite mail could not be sent; it can be sent again. */
	mailSent: z.boolean(),
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const PersonRef = z.object({ id: z.string(), name: z.string() });

const ProfileColumns = {
	number: personProfile.number,
	status: personProfile.status,
	startDate: personProfile.startDate,
	endDate: personProfile.endDate,
};

/** Whether the person has set a password (accepted the invite). */
const accountStatus = sql<"invited" | "active">`case when exists (
	select 1 from ${account}
	where ${account.userId} = ${user.id}
		and ${account.providerId} = 'credential'
		and ${account.password} is not null
) then 'active' else 'invited' end`;

const LeerlingRowSchema = z.object({
	id: z.string(),
	number: z.number().nullable(),
	name: z.string(),
	email: z.string(),
	status: z.enum(["actief", "inactief"]),
	account: z.enum(["invited", "active"]),
	startDate: z.string().nullable(),
	endDate: z.string().nullable(),
	vasteCoach: PersonRef.nullable(),
	vervanger: PersonRef.nullable(),
});

const leerlingenList = keyuserProcedure
	.route({ method: "GET", path: "/people/leerlingen", tags: ["people"] })
	.output(z.array(LeerlingRowSchema))
	.handler(async ({ context }) => {
		const organizationId = ownSchool(context);
		const rows = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				account: accountStatus,
				...ProfileColumns,
			})
			.from(user)
			.leftJoin(personProfile, eq(personProfile.userId, user.id))
			.where(and(eq(user.organizationId, organizationId), eq(user.role, "leerling")))
			.orderBy(user.name);
		const links = rows.length
			? await context.db
					.select({
						leerlingId: coachAssignment.leerlingId,
						kind: coachAssignment.kind,
						coachId: user.id,
						coachName: user.name,
					})
					.from(coachAssignment)
					.innerJoin(user, eq(user.id, coachAssignment.coachId))
					.where(inArray(coachAssignment.leerlingId, rows.map((r) => r.id)))
			: [];
		const coachOf = (leerlingId: string, kind: KoppelingKind) => {
			const l = links.find((x) => x.leerlingId === leerlingId && x.kind === kind);
			return l ? { id: l.coachId, name: l.coachName } : null;
		};
		return rows.map((r) => ({
			id: r.id,
			number: r.number,
			name: r.name,
			email: r.email,
			status: r.status ?? "actief",
			account: r.account,
			startDate: r.startDate,
			endDate: r.endDate,
			vasteCoach: coachOf(r.id, "vast"),
			vervanger: coachOf(r.id, "vervanger"),
		}));
	});

const CoachRowSchema = z.object({
	id: z.string(),
	number: z.number().nullable(),
	name: z.string(),
	email: z.string(),
	status: z.enum(["actief", "inactief"]),
	account: z.enum(["invited", "active"]),
	startDate: z.string().nullable(),
	endDate: z.string().nullable(),
	/** Leerlingen with this coach as vaste coach. */
	leerlingen: z.number(),
	/** Leerlingen this coach stands in for. */
	vervangingen: z.number(),
});

const coachesList = keyuserProcedure
	.route({ method: "GET", path: "/people/coaches", tags: ["people"] })
	.output(z.array(CoachRowSchema))
	.handler(async ({ context }) => {
		const organizationId = ownSchool(context);
		const rows = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				account: accountStatus,
				...ProfileColumns,
			})
			.from(user)
			.leftJoin(personProfile, eq(personProfile.userId, user.id))
			.where(and(eq(user.organizationId, organizationId), eq(user.role, "coach")))
			.orderBy(user.name);
		const counts = rows.length
			? await context.db
					.select({
						coachId: coachAssignment.coachId,
						kind: coachAssignment.kind,
						n: sql<number>`count(*)::int`,
					})
					.from(coachAssignment)
					.where(inArray(coachAssignment.coachId, rows.map((r) => r.id)))
					.groupBy(coachAssignment.coachId, coachAssignment.kind)
			: [];
		const count = (coachId: string, kind: KoppelingKind) =>
			counts.find((c) => c.coachId === coachId && c.kind === kind)?.n ?? 0;
		return rows.map((r) => ({
			id: r.id,
			number: r.number,
			name: r.name,
			email: r.email,
			status: r.status ?? "actief",
			account: r.account,
			startDate: r.startDate,
			endDate: r.endDate,
			leerlingen: count(r.id, "vast"),
			vervangingen: count(r.id, "vervanger"),
		}));
	});

// ---------------------------------------------------------------------------
// Adding and koppelen
// ---------------------------------------------------------------------------

const leerlingenCreate = keyuserProcedure
	.route({ method: "POST", path: "/people/leerlingen", tags: ["people"] })
	.input(LeerlingInput)
	.output(CreatedSchema)
	.handler(({ input, context }) => addPerson(context, "leerling", input));

const coachesCreate = keyuserProcedure
	.route({ method: "POST", path: "/people/coaches", tags: ["people"] })
	.input(CoachInput)
	.output(CreatedSchema)
	.handler(({ input, context }) => addPerson(context, "coach", input));

/** Set or end the vaste coach or the vervanger of a leerling (INC-18). */
const koppelingSet = keyuserProcedure
	.route({ method: "POST", path: "/people/koppeling", tags: ["people"] })
	.input(
		z.object({
			leerlingId: z.string(),
			kind: z.enum(["vast", "vervanger"]),
			coachId: z.string().nullable(),
		}),
	)
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input, context }) => {
		const organizationId = ownSchool(context);
		await assertNotArchived(context.db, organizationId);
		await setKoppeling(context.db, { organizationId, ...input });
		return { ok: true as const };
	});

export const peopleRouter = base.router({
	leerlingen: base.router({ list: leerlingenList, create: leerlingenCreate }),
	coaches: base.router({ list: coachesList, create: coachesCreate }),
	koppeling: base.router({ set: koppelingSet }),
});
