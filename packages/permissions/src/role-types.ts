/**
 * App-specific role + permission vocabulary. Roles are ordered from least to
 * most privileged; the `can` checker uses this ordering for hierarchical roles.
 *
 * The real Incluvo hierarchy (QUESTIONS 3.x) is:
 *   leerling < ontwikkelaar < coach < keyuser < superadmin
 * where
 *   - superadmin = Ondivera platform owner,
 *   - keyuser    = school/klant beheerder,
 *   - coach      = coach/docent,
 *   - leerling   = pupil,
 *   - ontwikkelaar = course-builder right (#25–#36).
 *
 * The legacy demo roles "member" and "admin" are retained at the ends of the
 * ordering so existing apps/server + apps/web code keeps compiling and working
 * (member is treated as the lowest, admin as the highest privilege). New code
 * should use the Incluvo roles above.
 */
export const ROLES = [
	"member",
	"leerling",
	"ontwikkelaar",
	"coach",
	"keyuser",
	"superadmin",
	"admin",
] as const;

export type UserRole = (typeof ROLES)[number];

/** The real Incluvo tenant roles (excludes the legacy member/admin aliases). */
export const INCLUVO_ROLES = [
	"leerling",
	"ontwikkelaar",
	"coach",
	"keyuser",
	"superadmin",
] as const;

export type IncluvoRole = (typeof INCLUVO_ROLES)[number];

/** Resources that can be acted upon. */
export type PermissionSubject =
	| "tenant"
	| "user"
	| "form"
	| "coachplan"
	| "course"
	| "section"
	| "contentBlock"
	| "assignment"
	| "task"
	| "chat"
	| "notification"
	| "audit"
	// Legacy demo subject, kept for the sample `item` vertical slice.
	| "item";

/** Actions that can be performed on a subject. */
export type PermissionAction = "read" | "create" | "update" | "delete";
