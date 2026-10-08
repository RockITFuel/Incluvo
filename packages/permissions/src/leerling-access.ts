import { sameSchool, type TenantScoped } from "./check";
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
 *   (not the superadmin: Ondivera manages the platform, it doesn't coach;
 *   see `sameSchool`)
 *   - a coach with a `coach_assignment` to the leerling (vaste coach or
 *     vervanger, INC-18)
 * Everyone else is refused, including the keyuser (INC-16: they manage
 * leerlingen and koppelingen, not the pupils' plans, chats or taken), an ontwikkelaar (D4: builds courses
 * only), unassigned coaches, other leerlingen and anyone from another school.
 *
 * Role-specific limits (e.g. only coach+ may grade) are checked on top of this.
 */
export function canAccessLeerling(actor: PolicySubject, link: LeerlingLink): boolean {
	if (actor.userId === link.leerlingId) return true;
	if (!sameSchool(actor, link)) return false;
	if (actor.role === "coach") return link.coachIds.includes(actor.userId);
	return false;
}
