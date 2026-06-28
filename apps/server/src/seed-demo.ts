/**
 * Idempotent demo seed for Epic 1 (auth, rollen & multi-tenant).
 *
 * Run with: `bun run --cwd apps/server seed:demo`
 *
 * Because passwords must be hashed by better-auth, users are created through the
 * better-auth sign-up API (not a raw insert); we then set their app `role` +
 * `organizationId` directly on the row. Re-running is safe: orgs/users/
 * assignments are looked up before insert.
 *
 * Demo logins (all password `incluvo123`):
 *   superadmin@incluvo.local   superadmin   → Ondivera org
 *   keyuser@incluvo.local      keyuser      → Demo School
 *   coach@incluvo.local        coach        → Demo School
 *   leerling@incluvo.local     leerling     → Demo School
 *   ontwikkelaar@incluvo.local ontwikkelaar → Demo School
 * Plus a coach_assignment linking coach ↔ leerling.
 */
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const { auth } = await import("./auth");
const schema = await import("@incluvo/drizzle/schema");
const { and, eq } = await import("drizzle-orm");

const { organization, user, membership, coachAssignment } = schema;
type IncluvoRole = (typeof schema.userRole.enumValues)[number];

const PASSWORD = "incluvo123";

interface DemoUser {
	email: string;
	name: string;
	role: IncluvoRole;
	tenant: "ondivera" | "school";
}

const DEMO_USERS: DemoUser[] = [
	{ email: "superadmin@incluvo.local", name: "Demo Superadmin", role: "superadmin", tenant: "ondivera" },
	{ email: "keyuser@incluvo.local", name: "Demo Keyuser", role: "keyuser", tenant: "school" },
	{ email: "coach@incluvo.local", name: "Demo Coach", role: "coach", tenant: "school" },
	{ email: "leerling@incluvo.local", name: "Demo Leerling", role: "leerling", tenant: "school" },
	{ email: "ontwikkelaar@incluvo.local", name: "Demo Ontwikkelaar", role: "ontwikkelaar", tenant: "school" },
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

	const res = await auth.api.signUpEmail({
		body: { email: d.email, password: PASSWORD, name: d.name },
	});
	const id = (res as { user?: { id?: string } }).user?.id;
	if (!id) throw new Error(`Sign-up did not return a user id for ${d.email}`);
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
	console.log("  + coach_assignment coach ↔ leerling");
}

async function main() {
	console.log("Seeding Incluvo demo (Epic 1)…");

	// Tenants: one Ondivera root + one school under it.
	const ondiveraId = await ensureOrg({ name: "Ondivera", kind: "ondivera" });
	const schoolId = await ensureOrg({
		name: "Demo School",
		kind: "school",
		parentId: ondiveraId,
	});

	// Users (via better-auth) + role/tenant.
	const ids: Record<string, string> = {};
	for (const d of DEMO_USERS) {
		const id = await ensureUser(d);
		ids[d.email] = id;
		await setRoleAndTenant(
			id,
			d.role,
			d.tenant === "ondivera" ? ondiveraId : schoolId,
		);
	}

	// Coach ↔ leerling assignment within the school.
	await ensureCoachAssignment(
		schoolId,
		ids["coach@incluvo.local"]!,
		ids["leerling@incluvo.local"]!,
	);

	console.log("Done. Logins (password `incluvo123`):");
	for (const d of DEMO_USERS) console.log(`  ${d.role.padEnd(12)} ${d.email}`);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
