import { atLeast, type UserRole } from "@incluvo/permissions";

/** Where a role lands after logging in. */
export function roleHome(
	role: UserRole,
): "/dashboard" | "/cursussen" | "/welkom" | "/leerlingen" {
	// The keyuser manages the school's leerlingen and coaches (INC-16).
	if (role === "keyuser") return "/leerlingen";
	if (atLeast(role, "coach")) return "/dashboard";
	if (role === "ontwikkelaar") return "/cursussen";
	return "/welkom";
}
