import { atLeast, type UserRole } from "@incluvo/permissions";
import {
	GraduationCap,
	Home,
	LayoutDashboard,
	ListChecks,
	MessageSquare,
	NotebookPen,
	Settings,
	Sparkles,
	Star,
	UserRound,
	Users,
} from "lucide-solid";
import type { NavSection } from "./app-shell";

/** Live counts for the sidebar nav-badges (the prototype shows these too). */
export type NavBadges = {
	/** Leerling: open taken voor vandaag. */
	taken?: number;
	/** Coach: ingeleverde coachplannen in de inbox. */
	coachplannen?: number;
};

/**
 * Role-aware sidebar navigation. The branching is real (driven by the session
 * role from `account.me`); hrefs point at placeholder routes (`/`, `/items`,
 * `/beheer`) that later epics replace with the real destinations.
 *
 *   - leerling     → Welkom, Mijn taken, Cursussen, Mijn plan, Chat
 *   - coach        → Dashboard, Leerlingen, Cursussen, Chat
 *   - keyuser/up   → coach nav + a Beheer/Admin entry
 *   - ontwikkelaar → leerling-style nav (course builder lives under Cursussen)
 */
export function navForRole(role: UserRole, badges: NavBadges = {}): NavSection[] {
	// Coach and above get the coach-oriented nav.
	if (atLeast(role, "coach")) {
		const items = [
			{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
			{ label: "Leerlingen", href: "/dashboard", icon: Users },
			{
				label: "Coachplannen",
				href: "/plan",
				icon: NotebookPen,
				badge: badges.coachplannen || undefined,
			},
			{ label: "Cursussen", href: "/cursussen", icon: GraduationCap },
			{ label: "Chat", href: "/chat", icon: MessageSquare },
			{ label: "Assistent", href: "/assistent", icon: Sparkles },
		];
		const sections: NavSection[] = [{ label: "Navigatie", items }];

		// keyuser & superadmin also manage the tenant + form templates.
		if (atLeast(role, "keyuser")) {
			sections.push({
				label: "Beheer",
				items: [
					{ label: "Beheer", href: "/beheer", icon: Settings },
					{ label: "Formulieren", href: "/plan/beheer", icon: NotebookPen },
				],
			});
		}
		return sections;
	}

	// leerling / ontwikkelaar / member: pupil-oriented nav.
	return [
		{
			label: "Navigatie",
			items: [
				{ label: "Welkom", href: "/welkom", icon: Home },
				{
					label: "Mijn taken",
					href: "/taken",
					icon: ListChecks,
					badge: badges.taken || undefined,
				},
				{ label: "Cursussen", href: "/cursussen", icon: GraduationCap },
				{ label: "Mijn plan", href: "/plan", icon: NotebookPen },
				{ label: "Chat", href: "/chat", icon: MessageSquare },
			],
		},
		// The prototype's "Snel" shortcuts (inert there) get real destinations:
		// successen live on the Welkom dashboard, profiel is its own page.
		{
			label: "Snel",
			items: [
				{ label: "Mijn successen", href: "/welkom", icon: Star },
				{ label: "Mijn profiel", href: "/profiel", icon: UserRound },
			],
		},
	];
}

/** Human-readable Dutch label for a role, shown in the shell user area. */
export function roleLabel(role: UserRole): string {
	switch (role) {
		case "superadmin":
			return "Superadmin";
		case "keyuser":
			return "Keyuser";
		case "coach":
			return "Coach";
		case "ontwikkelaar":
			return "Ontwikkelaar";
		case "leerling":
			return "Leerling";
		default:
			return "Gebruiker";
	}
}
