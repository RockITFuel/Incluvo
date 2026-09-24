import { atLeast, type UserRole } from "@incluvo/permissions";

/** Where a role lands after logging in. */
export function roleHome(role: UserRole): "/dashboard" | "/cursussen" | "/welkom" {
	if (atLeast(role, "coach")) return "/dashboard";
	if (role === "ontwikkelaar") return "/cursussen";
	return "/welkom";
}
