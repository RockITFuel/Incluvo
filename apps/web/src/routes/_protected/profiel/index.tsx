import { createFileRoute } from "@tanstack/solid-router";
import { Accessibility, Mail, School, UserRound } from "lucide-solid";
import { Show } from "solid-js";
import { roleLabel } from "../../../components/shell/nav";
import { useMe } from "../../../lib/auth/use-me";

/**
 * Mijn profiel — the destination of the sidebar "Snel" shortcut and the
 * user-menu item (both inert placeholders in the approved prototype). A calm
 * read-only overview of who is ingelogd: naam, e-mail, rol en school, plus a
 * pointer to the toegankelijkheids-instellingen in the topbar.
 */
export const Route = createFileRoute("/_protected/profiel/")({
	component: ProfielPage,
});

function initials(name: string): string {
	return (
		name
			.trim()
			.split(/\s+/)
			.map((s) => s[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

function ProfielPage() {
	const me = useMe();

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Mijn profiel</h1>
					<div class="sub">Jouw gegevens, zoals je school ze heeft ingesteld.</div>
				</div>
			</div>

			<div style={{ "max-width": "560px" }}>
				<div class="card" style={{ "margin-bottom": "16px" }}>
					<div class="ds-row" style={{ gap: "16px" }}>
						<div
							class="avatar"
							style={{ width: "64px", height: "64px", "font-size": "22px" }}
							aria-hidden="true"
						>
							{initials(me.user()?.name ?? "")}
						</div>
						<div class="ds-grow" style={{ "min-width": "0" }}>
							<div
								style={{
									"font-family": "var(--font-head)",
									"font-size": "20px",
									"font-weight": "600",
								}}
							>
								{me.user()?.name ?? "Gebruiker"}
							</div>
							<span class="chip primary" style={{ "margin-top": "4px" }}>
								{roleLabel(me.role())}
							</span>
						</div>
					</div>

					<div class="ds-col" style={{ gap: "12px", "margin-top": "18px" }}>
						<ProfileRow
							icon={<Mail class="size-4" aria-hidden="true" />}
							label="E-mail"
							value={me.user()?.email ?? "—"}
						/>
						<Show when={me.organization()?.name}>
							<ProfileRow
								icon={<School class="size-4" aria-hidden="true" />}
								label="School"
								value={me.organization()?.name ?? ""}
							/>
						</Show>
						<ProfileRow
							icon={<UserRound class="size-4" aria-hidden="true" />}
							label="Rol"
							value={roleLabel(me.role())}
						/>
					</div>
				</div>

				<div class="card" style={{ background: "rgb(var(--bg-2))" }}>
					<div class="ds-row" style={{ gap: "12px" }}>
						<div
							style={{
								width: "36px",
								height: "36px",
								"border-radius": "10px",
								background: "rgb(var(--primary-100))",
								color: "rgb(var(--primary-700))",
								display: "grid",
								"place-items": "center",
								"flex-shrink": "0",
							}}
						>
							<Accessibility class="size-4" aria-hidden="true" />
						</div>
						<div style={{ "font-size": "13px", color: "rgb(var(--ink-2))" }}>
							Weergave aanpassen (contrast, lettergrootte, dyslexie-lettertype,
							voorlezen)? Gebruik de <strong>toegankelijkheidsknop</strong>{" "}
							rechtsboven in de balk — je keuzes gelden overal in Incluvo.
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function ProfileRow(props: { icon: unknown; label: string; value: string }) {
	return (
		<div class="ds-row" style={{ gap: "10px" }}>
			<span style={{ color: "rgb(var(--muted))", display: "inline-flex" }}>
				{props.icon as never}
			</span>
			<span
				style={{
					"font-size": "12px",
					color: "rgb(var(--muted))",
					width: "72px",
					"flex-shrink": "0",
				}}
			>
				{props.label}
			</span>
			<span style={{ "font-size": "14px", "min-width": "0", "overflow-wrap": "anywhere" }}>
				{props.value}
			</span>
		</div>
	);
}
