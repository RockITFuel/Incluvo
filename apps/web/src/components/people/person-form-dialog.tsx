import { useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { useMe } from "../../lib/auth/use-me";
import { friendlyError } from "../../lib/errors";
import { client } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Select } from "../ui/select";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { type PersonKind, personId } from "./format";

type FieldType = "text" | "email" | "date" | "url" | "gender";
type Field = { key: string; label: string; required?: boolean; type?: FieldType; hint?: string };

const NAME_FIELDS: Field[] = [
	{
		key: "eckId",
		label: "ECK-ID",
		hint: "Kenmerk in de educatieve contentketen; hiermee koppel je later een leermethode.",
	},
	{ key: "lastName", label: "Achternaam", required: true },
	{ key: "prefix", label: "Voorvoegsel", hint: "Bijvoorbeeld: van, de, van der" },
	{ key: "firstNames", label: "Voornamen" },
	{ key: "initials", label: "Voorletters" },
	{ key: "nickname", label: "Roepnaam", required: true },
];

/** The fields of INC-15 (leerling) and INC-17 (coach), in the tickets' order. */
const FIELDS: Record<PersonKind, Field[]> = {
	leerling: [
		...NAME_FIELDS,
		{ key: "birthDate", label: "Geboortedatum", required: true, type: "date" },
		{ key: "gender", label: "Geslacht", type: "gender" },
		{ key: "username", label: "Gebruikersnaam" },
		{
			key: "email",
			label: "E-mailadres",
			required: true,
			type: "email",
			hint: "Hier komt de uitnodiging om een wachtwoord te kiezen.",
		},
		{ key: "photoUrl", label: "Foto (URL)", type: "url", hint: "Een link die met https:// begint." },
		{ key: "startDate", label: "Startdatum Incluvo", required: true, type: "date" },
		{ key: "endDate", label: "Stopdatum Incluvo", type: "date" },
	],
	coach: [
		...NAME_FIELDS,
		{ key: "username", label: "Gebruikersnaam" },
		{
			key: "email",
			label: "E-mailadres",
			required: true,
			type: "email",
			hint: "Hier komt de uitnodiging om een wachtwoord te kiezen.",
		},
		{ key: "startDate", label: "Indienst datum", required: true, type: "date" },
		{ key: "endDate", label: "Uitdienst datum", type: "date" },
	],
};

const GENDERS = [
	{ value: "man", label: "Man" },
	{ value: "vrouw", label: "Vrouw" },
	{ value: "anders", label: "Anders" },
	{ value: "onbekend", label: "Zeg ik liever niet" },
];

const today = () => new Date().toISOString().slice(0, 10);

/** The same checks as the server, so mistakes show at the field before saving. */
function validate(kind: PersonKind, v: Record<string, string>): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const f of FIELDS[kind]) {
		if (f.required && !v[f.key]?.trim()) errors[f.key] = `Vul ${f.label.toLowerCase()} in.`;
	}
	if (v.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) {
		errors.email = "Dit is geen geldig e-mailadres.";
	}
	if (v.photoUrl?.trim() && !/^https:\/\/\S+\.\S+/.test(v.photoUrl.trim())) {
		errors.photoUrl = "Gebruik een link die met https:// begint.";
	}
	if (v.birthDate && v.birthDate >= today()) {
		errors.birthDate = "De geboortedatum moet in het verleden liggen.";
	}
	if (v.endDate && v.startDate && v.endDate < v.startDate) {
		errors.endDate =
			kind === "coach"
				? "De uitdienst datum kan niet vóór de indienst datum liggen."
				: "De stopdatum kan niet vóór de startdatum liggen.";
	}
	return errors;
}

export type CreatedPerson = { id: string; number: number; name: string; mailSent: boolean };

/**
 * "Leerling toevoegen" (INC-15) / "Coach toevoegen" (INC-17) for the keyuser.
 * The person joins the keyuser's own school; the ID is made on saving. When
 * saving fails, everything typed stays in the form.
 */
export function PersonFormDialog(props: {
	kind: PersonKind;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated?: (person: CreatedPerson) => void;
}) {
	const me = useMe();
	const router = useRouter();
	// A fresh form each time the dialog opens; a failed save keeps the input.
	const [values, setValues] = createSignal(
		(): Record<string, string> => (props.open ? { startDate: today() } : {}),
	);
	const [errors, setErrors] = createSignal<Record<string, string>>(() => (props.open, {}));
	const setValue = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
	const noun = () => (props.kind === "leerling" ? "leerling" : "coach");

	const create = createAction(
		async (input: Record<string, string | undefined>) => {
			const created =
				props.kind === "leerling"
					? await client.people.leerlingen.create(input as never)
					: await client.people.coaches.create(input as never);
			toast({
				title: props.kind === "leerling" ? "Leerling toegevoegd" : "Coach toegevoegd",
				description: created.mailSent
					? `${created.name} krijgt een e-mail om een wachtwoord te kiezen.`
					: `${created.name} is toegevoegd, maar de uitnodiging kon niet worden verstuurd. Verstuur hem later opnieuw via Beheer.`,
				tone: created.mailSent ? "success" : "warning",
			});
			props.onOpenChange(false);
			await refresh(router, "people", "admin");
			props.onCreated?.(created);
		},
		{
			onError: (error) => {
				const field = (error as { data?: { field?: string } }).data?.field;
				if (field) setErrors({ [field]: friendlyError(error) });
				else toast({ title: "Opslaan lukte niet", description: friendlyError(error), tone: "danger" });
			},
		},
	);

	const submit = () => {
		const current = values();
		const found = validate(props.kind, current);
		setErrors(found);
		if (Object.keys(found).length > 0) {
			queueMicrotask(() =>
				(document.querySelector("[data-person-form] [aria-invalid='true']") as HTMLElement | null)?.focus(),
			);
			return;
		}
		const input: Record<string, string | undefined> = {};
		for (const f of FIELDS[props.kind]) {
			const v = current[f.key]?.trim();
			input[f.key] = v ? v : undefined;
		}
		void create.run(input);
	};

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title={props.kind === "leerling" ? "Leerling toevoegen" : "Coach toevoegen"}
			description={`Velden met * zijn verplicht. De ${noun()} komt bij ${me.organization()?.name ?? "jouw school"}.`}
			class="max-w-2xl"
			footer={
				<>
					<Button variant="subtle" onClick={() => props.onOpenChange(false)}>
						Annuleren
					</Button>
					<Button disabled={create.pending()} onClick={submit}>
						{create.pending() ? "Opslaan…" : "Opslaan"}
					</Button>
				</>
			}
		>
			<form
				data-person-form
				class="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2"
				novalidate
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<span class="text-small font-medium text-ink-2">ID</span>
					<p class="rounded-2 border border-line bg-bg-2 px-3 py-2 text-small text-muted">
						{personId(props.kind, null)}
					</p>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-small font-medium text-ink-2">School</span>
					<p class="rounded-2 border border-line bg-bg-2 px-3 py-2 text-small text-ink-2">
						{me.organization()?.name ?? "Jouw school"}
					</p>
				</div>
				<For each={FIELDS[props.kind]}>
					{(f) => (
						<Show
							when={f.type === "gender"}
							fallback={
								<Input
									label={f.label}
									required={f.required}
									type={f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
									value={values()[f.key] ?? ""}
									description={f.hint}
									error={errors()[f.key]}
									onInput={(e) => {
										setValue(f.key, e.currentTarget.value);
										if (errors()[f.key]) setErrors({ ...errors(), [f.key]: "" });
									}}
								/>
							}
						>
							<Select
								label={f.label}
								options={GENDERS}
								value={values()[f.key]}
								placeholder="Kies…"
								onChange={(v) => setValue(f.key, v ?? "")}
							/>
						</Show>
					)}
				</For>
				{/* Enter in a field saves; screen readers use the footer button. */}
				<button type="submit" class="sr-only" tabindex={-1} aria-hidden="true">
					Opslaan
				</button>
			</form>
		</Dialog>
	);
}
