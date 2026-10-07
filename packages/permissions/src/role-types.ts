/**
 * Incluvo roles, ordered from least to most privileged:
 *   leerling < ontwikkelaar < coach < keyuser < superadmin
 * where
 *   - superadmin   = Ondivera platform owner,
 *   - keyuser      = school/klant beheerder,
 *   - coach        = coach/docent,
 *   - ontwikkelaar = course builder (#25–#36); see `canBuildCourses` — building
 *                    courses is a capability, not something coaches inherit,
 *   - leerling     = pupil.
 */
export const ROLES = [
	"leerling",
	"ontwikkelaar",
	"coach",
	"keyuser",
	"superadmin",
] as const;

export type UserRole = (typeof ROLES)[number];

/** Alias kept for existing imports. */
export const INCLUVO_ROLES = ROLES;
export type IncluvoRole = UserRole;

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
	| "audit";

/** Actions that can be performed on a subject. */
export type PermissionAction = "read" | "create" | "update" | "delete";
