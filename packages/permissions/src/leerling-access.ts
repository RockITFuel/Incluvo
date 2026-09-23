import { isSuperadmin, sameTenant, type TenantScoped } from "./check";
import type { PolicySubject } from "./policy";

/** A leerling plus the coaches assigned to them. */
export interface LeerlingLink extends TenantScoped {
	leerlingId: string;
	coachIds: readonly string[];
}

/**
 * The one rule for who may see or change a leerling's data (plans, courses,
 * submissions, files, tasks, mood):
 *   - the leerling themselves
 *   - the superadmin (Ondivera)
 *   - a keyuser of the leerling's school — D1: a keyuser acts as any coach there
 *   - a coach with a `coach_assignment` to the leerling
 * Everyone else is refused, including an ontwikkelaar (D4: builds courses
 * only), unassigned coaches, other leerlingen and anyone from another school.
 *
 * Role-specific limits (e.g. only coach+ may grade) are checked on top of this.
 */
export function canAccessLeerling(actor: PolicySubject, link: LeerlingLink): boolean {
	if (actor.userId === link.leerlingId) return true;
	if (isSuperadmin(actor.role)) return true;
	if (!sameTenant(actor, link)) return false;
	if (actor.role === "keyuser") return true;
	if (actor.role === "coach") return link.coachIds.includes(actor.userId);
	return false;
}
