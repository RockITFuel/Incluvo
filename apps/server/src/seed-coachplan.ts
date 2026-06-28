/**
 * Idempotent demo seed for the Coachplan epic (#8–#21). Builds one Ondivera
 * example template ("Ondivera Startgesprek") with a themed leerling-gedeelte
 * (incl. a leervoorkeur question, #19) and a small coach-gedeelte (#17), copies
 * it into the Demo School, and sets it as the school default (#10) so the
 * leerling wizard at /plan has a form to fill.
 *
 * Run with: `bun run --cwd apps/server seed:coachplan`
 * (Requires the Epic-1 demo seed first, for the Ondivera + Demo School orgs.)
 */
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const schema = await import("@incluvo/drizzle/schema");
const { and, eq } = await import("drizzle-orm");

const { organization, formTemplate, formQuestion } = schema;

type NewQuestion = {
	section: "leerling" | "coach";
	type:
		| "short_text"
		| "long_text"
		| "single_choice"
		| "multiple_choice"
		| "scale"
		| "boolean"
		| "smiley"
		| "leervoorkeur";
	label: string;
	helpText?: string;
	required?: boolean;
	options?: unknown;
};

const TEMPLATE_NAME = "Ondivera Startgesprek";

const QUESTIONS: NewQuestion[] = [
	{
		section: "leerling",
		type: "long_text",
		label: "Hoe gaat het de laatste tijd op school?",
		helpText: "Schrijf zoveel als je wil. Er zijn geen foute antwoorden.",
		options: { theme: "Welkom" },
	},
	{
		section: "leerling",
		type: "long_text",
		label: "Wat zou je graag willen leren of verbeteren?",
		helpText: "Denk aan een vak, vaardigheid of iets persoonlijks.",
		options: { theme: "Welkom" },
	},
	{
		section: "leerling",
		type: "multiple_choice",
		label: "Wanneer kun jij goed leren?",
		helpText: "Meerdere antwoorden mogen.",
		options: {
			theme: "Hoe leer ik",
			choices: [
				{ value: "ochtend", label: "In de ochtend" },
				{ value: "na_school", label: "Na school" },
				{ value: "weekend", label: "In het weekend" },
				{ value: "stilte", label: "In stilte" },
				{ value: "muziek", label: "Met muziek" },
				{ value: "samen", label: "Met iemand erbij" },
			],
		},
	},
	{
		section: "leerling",
		type: "leervoorkeur",
		label: "Hoe pak je nieuwe stof het liefst aan?",
		helpText: "Dit helpt ons je leeromgeving in te stellen.",
		options: {
			theme: "Hoe leer ik",
			choices: [
				{ value: "korte_video", label: "Korte video" },
				{ value: "stap_voor_stap", label: "Stap-voor-stap lezen" },
				{ value: "uitproberen", label: "Iets uitproberen" },
				{ value: "bespreken", label: "Met iemand bespreken" },
				{ value: "podcast", label: "Luisteren (podcast)" },
				{ value: "opschrijven", label: "Zelf opschrijven" },
			],
		},
	},
	{
		section: "leerling",
		type: "scale",
		label: "Hoeveel vertrouwen heb je in dit vak op dit moment?",
		options: {
			theme: "Hoe leer ik",
			scaleMin: 1,
			scaleMax: 5,
			scaleMinLabel: "Weinig",
			scaleMaxLabel: "Veel",
		},
	},
	{
		section: "leerling",
		type: "long_text",
		label: "Zijn er dingen waar je rekening mee wilt houden?",
		helpText: "Bijv. dyslexie, ADHD, concentratie, geluid, licht…",
		options: { theme: "Wat heb ik nodig" },
	},
	{
		section: "leerling",
		type: "long_text",
		label: "Wat zou je nog willen zeggen tegen je coach?",
		helpText: "Optioneel. Alleen jij en je coach lezen dit.",
		options: { theme: "Afronding" },
	},
	// Coach-gedeelte (#17)
	{
		section: "coach",
		type: "long_text",
		label: "Wat is je algemene beeld van de leerling op dit moment?",
		options: { theme: "Beeld van de leerling" },
	},
	{
		section: "coach",
		type: "long_text",
		label: "Welke sterke kanten zie je?",
		options: { theme: "Beeld van de leerling" },
	},
	{
		section: "coach",
		type: "long_text",
		label: "Welke afspraken maken jullie?",
		options: { theme: "Plan" },
	},
];

async function ensureTemplate(): Promise<void> {
	const [ondivera] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.name, "Ondivera"));
	if (!ondivera) {
		throw new Error("Ondivera org not found — run seed:demo first.");
	}
	const [school] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.name, "Demo School"));
	if (!school) {
		throw new Error("Demo School org not found — run seed:demo first.");
	}

	// Ondivera platform template (#8).
	let [tpl] = await db
		.select({ id: formTemplate.id })
		.from(formTemplate)
		.where(
			and(
				eq(formTemplate.name, TEMPLATE_NAME),
				eq(formTemplate.scope, "ondivera"),
			),
		);
	if (!tpl) {
		[tpl] = await db
			.insert(formTemplate)
			.values({
				name: TEMPLATE_NAME,
				description:
					"Voorbeeld-startgesprek met leerling- en coachgedeelte en leervoorkeuren.",
				scope: "ondivera",
				organizationId: null,
			})
			.returning({ id: formTemplate.id });
		if (!tpl) throw new Error("Failed to create Ondivera template");
		await db.insert(formQuestion).values(
			QUESTIONS.map((q, i) => ({
				templateId: tpl!.id,
				section: q.section,
				type: q.type,
				label: q.label,
				helpText: q.helpText ?? null,
				required: q.required ?? false,
				position: i,
				options: (q.options ?? null) as never,
			})),
		);
		console.log(`  + Ondivera template "${TEMPLATE_NAME}" (${QUESTIONS.length} vragen)`);
	} else {
		console.log(`  = Ondivera template "${TEMPLATE_NAME}" already exists`);
	}

	// School copy (#9) + set as default (#10).
	let [schoolTpl] = await db
		.select({ id: formTemplate.id })
		.from(formTemplate)
		.where(
			and(
				eq(formTemplate.name, `${TEMPLATE_NAME} (school)`),
				eq(formTemplate.organizationId, school.id),
			),
		);
	if (!schoolTpl) {
		[schoolTpl] = await db
			.insert(formTemplate)
			.values({
				name: `${TEMPLATE_NAME} (school)`,
				description: "Schoolversie van het Ondivera-startgesprek.",
				scope: "school",
				organizationId: school.id,
				parentTemplateId: tpl.id,
				isSchoolDefault: true,
			})
			.returning({ id: formTemplate.id });
		if (!schoolTpl) throw new Error("Failed to create school template");
		const srcQs = await db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.templateId, tpl.id));
		await db.insert(formQuestion).values(
			srcQs.map((q) => ({
				templateId: schoolTpl!.id,
				section: q.section,
				type: q.type,
				label: q.label,
				helpText: q.helpText,
				required: q.required,
				position: q.position,
				options: q.options,
			})),
		);
		console.log(`  + School copy set as default for Demo School`);
	} else {
		console.log(`  = School copy already exists`);
	}
}

async function main() {
	console.log("Seeding Coachplan demo (#8–#21)…");
	await ensureTemplate();
	console.log("Done.");
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
