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
	UserRound,
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
 * role from `account.me`).
 *
 *   - leerling     → Welkom, Mijn taken, Cursussen, Mijn plan, Chat
 *   - coach        → Dashboard, Coachplannen, Cursussen, Chat, Assistent
 *   - keyuser      → coach nav + Beheer, Formulieren
 *   - superadmin   → Overzicht (all schools), Cursussen, Beheer, Formulieren
 *   - ontwikkelaar → Cursussen (the course builder) and their profiel (D4)
 * While the role is still loading (null) there is no nav yet.
 */
export function navForRole(role: UserRole | null, badges: NavBadges = {}): NavSection[] {
	if (role === null) return [];
	// Ondivera manages the platform and its templates; it doesn't work with
	// leerlingen, so no coachplannen, chat or AI-assistent (sameSchool).
	if (role === "superadmin") {
		return [
			{
				label: "Navigatie",
				items: [
					{ label: "Overzicht", href: "/dashboard", icon: LayoutDashboard },
					{ label: "Cursussen", href: "/cursussen", icon: GraduationCap },
				],
			},
			{
				label: "Beheer",
				items: [
					{ label: "Beheer", href: "/beheer", icon: Settings },
					{ label: "Formulieren", href: "/plan/beheer", icon: NotebookPen },
				],
			},
		];
	}
	if (role === "ontwikkelaar") {
		return [
			{
				label: "Navigatie",
				items: [{ label: "Cursussen", href: "/cursussen", icon: GraduationCap }],
			},
			{
				label: "Snel",
				items: [{ label: "Mijn profiel", href: "/profiel", icon: UserRound }],
			},
		];
	}
	// Coach and above get the coach-oriented nav. There is deliberately no
	// separate "Leerlingen" entry: /dashboard *is* the leerlingen-overzicht
	// (backlog #42), the prototype's coach nav does not have one, and the entry
	// that used to sit here pointed at the keyuser-only /beheer (CODE-REVIEW.md).
	if (atLeast(role, "coach")) {
		const items = [
			{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
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

		// The keyuser also manages their school and its form templates.
		if (role === "keyuser") {
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

	// leerling: pupil-oriented nav.
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
		// "Mijn successen" pointed at /welkom too (already in the nav above).
		{
			label: "Snel",
			items: [{ label: "Mijn profiel", href: "/profiel", icon: UserRound }],
		},
	];
}

/** Human-readable Dutch label for a role, shown in the shell user area. */
export function roleLabel(role: UserRole | null): string {
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
