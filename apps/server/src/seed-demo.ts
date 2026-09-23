/**
 * Idempotent demo seed for Epic 1 (auth, rollen & multi-tenant).
 *
 * Run with: `bun run --cwd apps/server seed:demo`
 *
 * Users are created through `createAccount` (users.ts), which hashes the
 * password with better-auth (public sign-up is disabled); we then set their
 * app `role` + `organizationId` and membership row. Re-running is safe: orgs/users/
 * assignments are looked up before insert.
 *
 * Demo logins (all password `incluvo123`):
 *   superadmin@incluvo.local   superadmin   → Ondivera org
 *   keyuser@incluvo.local      keyuser      → Demo School
 *   coach@incluvo.local        coach        → Demo School
 *   leerling@incluvo.local     leerling     → Demo School
 *   ontwikkelaar@incluvo.local ontwikkelaar → Demo School
 * Plus a coach_assignment linking coach ↔ leerling.
 *
 * A second coach/leerling pair in Demo School and a second school ("Andere
 * School") exist so tests can check unassigned and cross-tenant access:
 *   coach2@incluvo.local ↔ leerling2@incluvo.local        → Demo School
 *   andere-keyuser@ / andere-coach@ ↔ andere-leerling@     → Andere School
 */
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const { createAccount } = await import("./users");
const schema = await import("@incluvo/drizzle/schema");
const { and, eq } = await import("drizzle-orm");

const { organization, user, membership, coachAssignment } = schema;
type IncluvoRole = (typeof schema.userRole.enumValues)[number];

const PASSWORD = "incluvo123";

interface DemoUser {
	email: string;
	name: string;
	role: IncluvoRole;
	tenant: "ondivera" | "school" | "andere";
}

const DEMO_USERS: DemoUser[] = [
	{ email: "superadmin@incluvo.local", name: "Demo Superadmin", role: "superadmin", tenant: "ondivera" },
	{ email: "keyuser@incluvo.local", name: "Demo Keyuser", role: "keyuser", tenant: "school" },
	{ email: "coach@incluvo.local", name: "Demo Coach", role: "coach", tenant: "school" },
	{ email: "leerling@incluvo.local", name: "Demo Leerling", role: "leerling", tenant: "school" },
	{ email: "ontwikkelaar@incluvo.local", name: "Demo Ontwikkelaar", role: "ontwikkelaar", tenant: "school" },
	{ email: "coach2@incluvo.local", name: "Tweede Coach", role: "coach", tenant: "school" },
	{ email: "leerling2@incluvo.local", name: "Tweede Leerling", role: "leerling", tenant: "school" },
	{ email: "andere-keyuser@incluvo.local", name: "Andere Keyuser", role: "keyuser", tenant: "andere" },
	{ email: "andere-coach@incluvo.local", name: "Andere Coach", role: "coach", tenant: "andere" },
	{ email: "andere-leerling@incluvo.local", name: "Andere Leerling", role: "leerling", tenant: "andere" },
];

/** Coach ↔ leerling links, by email. */
const DEMO_ASSIGNMENTS: [coach: string, leerling: string][] = [
	["coach@incluvo.local", "leerling@incluvo.local"],
	["coach2@incluvo.local", "leerling2@incluvo.local"],
	["andere-coach@incluvo.local", "andere-leerling@incluvo.local"],
];

/** Find-or-create an organization by name (+ kind/parent). */
async function ensureOrg(opts: {
	name: string;
	kind: "ondivera" | "school";
	parentId?: string | null;
}): Promise<string> {
	const [existing] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.name, opts.name));
	if (existing) return existing.id;

	const [row] = await db
		.insert(organization)
		.values({ name: opts.name, kind: opts.kind, parentId: opts.parentId ?? null })
		.returning({ id: organization.id });
	if (!row) throw new Error(`Failed to create org ${opts.name}`);
	console.log(`  + org "${opts.name}" (${opts.kind})`);
	return row.id;
}

/** Find-or-create a better-auth account, returning its user id. */
async function ensureUser(d: DemoUser): Promise<string> {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, d.email));
	if (existing) return existing.id;

	const id = await createAccount({
		email: d.email,
		name: d.name,
		role: d.role,
		organizationId: null, // set by setRoleAndTenant
		password: PASSWORD,
	});
	console.log(`  + user ${d.email}`);
	return id;
}

/** Set the app role + tenant on the user row, and upsert a membership row. */
async function setRoleAndTenant(
	userId: string,
	role: IncluvoRole,
	organizationId: string,
): Promise<void> {
	await db
		.update(user)
		.set({ role, organizationId, updatedAt: new Date() })
		.where(eq(user.id, userId));

	const [m] = await db
		.select({ id: membership.id })
		.from(membership)
		.where(
			and(
				eq(membership.userId, userId),
				eq(membership.organizationId, organizationId),
			),
		);
	if (m) {
		await db
			.update(membership)
			.set({ role, updatedAt: new Date() })
			.where(eq(membership.id, m.id));
	} else {
		await db.insert(membership).values({ userId, organizationId, role });
	}
}

async function ensureCoachAssignment(
	organizationId: string,
	coachId: string,
	leerlingId: string,
): Promise<void> {
	const [existing] = await db
		.select({ id: coachAssignment.id })
		.from(coachAssignment)
		.where(
			and(
				eq(coachAssignment.coachId, coachId),
				eq(coachAssignment.leerlingId, leerlingId),
			),
		);
	if (existing) return;
	await db
		.insert(coachAssignment)
		.values({ organizationId, coachId, leerlingId });
	console.log(`  + coach_assignment ${coachId} ↔ ${leerlingId}`);
}

async function main() {
	console.log("Seeding Incluvo demo (Epic 1)…");

	// Tenants: one Ondivera root + two schools under it.
	const ondiveraId = await ensureOrg({ name: "Ondivera", kind: "ondivera" });
	const schoolId = await ensureOrg({
		name: "Demo School",
		kind: "school",
		parentId: ondiveraId,
	});
	const andereId = await ensureOrg({
		name: "Andere School",
		kind: "school",
		parentId: ondiveraId,
	});
	const tenantIds = { ondivera: ondiveraId, school: schoolId, andere: andereId };

	// Users (via better-auth) + role/tenant.
	const ids: Record<string, string> = {};
	for (const d of DEMO_USERS) {
		const id = await ensureUser(d);
		ids[d.email] = id;
		await setRoleAndTenant(id, d.role, tenantIds[d.tenant]);
	}

	// Coach ↔ leerling assignments, each within the coach's school.
	for (const [coach, leerling] of DEMO_ASSIGNMENTS) {
		const tenant = DEMO_USERS.find((d) => d.email === coach)!.tenant;
		await ensureCoachAssignment(tenantIds[tenant], ids[coach]!, ids[leerling]!);
	}

	console.log("Done. Logins (password `incluvo123`):");
	for (const d of DEMO_USERS) console.log(`  ${d.role.padEnd(12)} ${d.email}`);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
