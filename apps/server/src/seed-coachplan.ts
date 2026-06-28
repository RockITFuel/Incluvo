/**
 * Idempotent demo seed for the Coachplan epic (#8–#21).
 *
 * Encodes the **real Ondivera questionnaire** as delivered by Mark Timmermans
 * (e-mail "Input Incluvo", 12-06-2026, attachment "de Ondivera Vragenlijst
 * Incluvo.docx"): a leerling-gedeelte ("Mijn Plan") and a coach-gedeelte
 * ("POPP" — ontwikkelingsperspectief), incl. leervoorkeuren (#19) and the
 * leerling→coach correspondences (#18) where a leerling answer prefills the
 * coach's POPP field (`form_question.maps_to_question_id`; applied on submit).
 *
 * The "(Weghalen) Welke foto's wil je delen?" question from the source is
 * intentionally omitted (privacy/toestemming, as Mark noted).
 *
 * Builds one Ondivera platform template, copies it into the Demo School and sets
 * it as the school default (#10) so the leerling wizard at /plan has a form.
 *
 * Run with: `bun run --cwd apps/server seed:coachplan`
 * (Requires the Epic-1 demo seed first, for the Ondivera + Demo School orgs.)
 */
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const schema = await import("@incluvo/drizzle/schema");
const { and, asc, eq } = await import("drizzle-orm");

const { organization, formTemplate, formQuestion } = schema;

type NewQuestion = {
	/** Stable key within this template, used to wire correspondences in seed. */
	key: string;
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
	/** #18 — key of the coach question this leerling answer prefills. */
	mapsToKey?: string;
};

const TEMPLATE_NAME = "Ondivera Mijn Plan (POPP)";

/** Leervoorkeur-labels (#19). Definitieve lijst volgt nog van Ondivera. */
const LEERVOORKEUR_CHOICES = [
	{ value: "korte_video", label: "Korte video" },
	{ value: "stap_voor_stap", label: "Stap-voor-stap lezen" },
	{ value: "uitproberen", label: "Iets uitproberen" },
	{ value: "bespreken", label: "Met iemand bespreken" },
	{ value: "podcast", label: "Luisteren (podcast)" },
	{ value: "opschrijven", label: "Zelf opschrijven" },
	{ value: "stilte", label: "In stilte werken" },
	{ value: "tekening", label: "Tekening / schema" },
];

const QUESTIONS: NewQuestion[] = [
	// ── Leerling: "Mijn Plan" ────────────────────────────────────────────────
	// Thema "Over mij"
	{
		key: "hobbys",
		section: "leerling",
		type: "long_text",
		label: "Wat vind je leuk om te doen?",
		helpText: "Denk aan hobby's, interesses en sport.",
		options: { theme: "Over mij" },
	},
	{
		key: "meer_leren",
		section: "leerling",
		type: "long_text",
		label: "Waarover zou je meer willen leren?",
		options: { theme: "Over mij" },
	},
	{
		key: "fav_vakken",
		section: "leerling",
		type: "short_text",
		label: "Wat zijn je favoriete vakken?",
		options: { theme: "Over mij" },
	},
	{
		key: "minst_vakken",
		section: "leerling",
		type: "short_text",
		label: "Wat zijn de vakken die je het minst leuk vindt?",
		options: { theme: "Over mij" },
	},
	{
		key: "belangrijk",
		section: "leerling",
		type: "long_text",
		label: "Wie zijn er belangrijk voor jou?",
		helpText: "Mensen, dieren — en waarom?",
		options: { theme: "Over mij" },
	},
	{
		key: "goed_in",
		section: "leerling",
		type: "long_text",
		label: "Waar ben jij goed in?",
		options: { theme: "Over mij" },
		mapsToKey: "coach_talenten",
	},
	{
		key: "minder_sterk",
		section: "leerling",
		type: "long_text",
		label: "Wat vind je minder sterke kanten van jezelf?",
		options: { theme: "Over mij" },
	},
	{
		key: "anderen_leuk",
		section: "leerling",
		type: "long_text",
		label: "Wat vinden anderen leuk aan jou, of waar vinden zij dat je goed in bent?",
		options: { theme: "Over mij" },
	},
	// Thema "Hoe ik leer"
	{
		key: "fijne_manier",
		section: "leerling",
		type: "long_text",
		label: "Wat vind je een fijne manier om te leren?",
		options: { theme: "Hoe ik leer" },
	},
	{
		key: "helpt_leren",
		section: "leerling",
		type: "long_text",
		label: "Wat helpt jou om goed te leren?",
		options: { theme: "Hoe ik leer" },
	},
	{
		key: "leervoorkeur",
		section: "leerling",
		type: "leervoorkeur",
		label: "Hoe pak je nieuwe stof het liefst aan?",
		helpText: "Dit helpt ons je leeromgeving in te stellen.",
		options: { theme: "Hoe ik leer", choices: LEERVOORKEUR_CHOICES },
	},
	// Thema "Wat ik wil leren"
	{
		key: "graag_leren",
		section: "leerling",
		type: "long_text",
		label: "Wat zou je graag willen leren?",
		options: { theme: "Wat ik wil leren" },
		mapsToKey: "coach_wat_wil_leerling",
	},
	{
		key: "beter_worden",
		section: "leerling",
		type: "long_text",
		label: "Waar ben je al goed in en wil je nog beter in worden?",
		options: { theme: "Wat ik wil leren" },
		mapsToKey: "coach_ontwikkelpunten",
	},
	// Thema "Wat ik nodig heb"
	{
		key: "wie_helpt",
		section: "leerling",
		type: "long_text",
		label: "Wie of wat helpt jou om het beste te leren?",
		options: { theme: "Wat ik nodig heb" },
		mapsToKey: "coach_krachtbronnen",
	},
	{
		key: "ondersteuning_school",
		section: "leerling",
		type: "long_text",
		label: "Hoe kunnen we jou vanuit school het beste ondersteunen?",
		options: { theme: "Wat ik nodig heb" },
	},
	{
		key: "begeleiding_vorm",
		section: "leerling",
		type: "single_choice",
		label: "Hoe wil je het liefst begeleid worden?",
		options: {
			theme: "Wat ik nodig heb",
			choices: [
				{ value: "digitaal", label: "Liever digitaal" },
				{ value: "face_to_face", label: "Liever face-to-face" },
				{ value: "mix", label: "Een mix" },
			],
		},
		mapsToKey: "coach_voorkeur_begeleiding",
	},
	{
		key: "rekening",
		section: "leerling",
		type: "long_text",
		label: "Zijn er dingen waar we rekening mee moeten houden?",
		helpText: "Bijvoorbeeld concentratie, geluid, licht, of iets persoonlijks.",
		options: { theme: "Wat ik nodig heb" },
	},

	// ── Coach: "POPP" (ontwikkelingsperspectief) ─────────────────────────────
	// Thema "Algemene gegevens"
	{
		key: "coach_algemeen",
		section: "coach",
		type: "long_text",
		label: "Algemene gegevens en context",
		helpText: "Kan deels uit het profiel van de leerling worden overgenomen.",
		options: { theme: "Algemene gegevens" },
	},
	// Thema "Ontwikkelingsperspectief en uitstroomprofiel"
	{
		key: "coach_wat_wil_leerling",
		section: "coach",
		type: "long_text",
		label: "Wat wil de leerling?",
		options: { theme: "Ontwikkelingsperspectief" },
	},
	{
		key: "coach_wat_wil_school",
		section: "coach",
		type: "long_text",
		label: "Wat wil de school bereiken?",
		options: { theme: "Ontwikkelingsperspectief" },
	},
	{
		key: "coach_integratie",
		section: "coach",
		type: "long_text",
		label:
			"Hoe integreren we de talenten, interesses en wensen van de leerling in het uitstroomprofiel?",
		options: { theme: "Ontwikkelingsperspectief" },
	},
	// Thema "Sterke punten en kansen" (coach vult dit aan het einde in)
	{
		key: "coach_talenten",
		section: "coach",
		type: "long_text",
		label: "Talenten en sterke kanten",
		helpText: "Wat kan de leerling al goed? Waar blinkt hij/zij in uit?",
		options: { theme: "Sterke punten en kansen" },
	},
	{
		key: "coach_ontwikkelpunten",
		section: "coach",
		type: "long_text",
		label: "Ontwikkelpunten en wensen",
		helpText: "Waar wil de leerling verder in groeien?",
		options: { theme: "Sterke punten en kansen" },
	},
	{
		key: "coach_krachtbronnen",
		section: "coach",
		type: "long_text",
		label: "Positieve factoren en krachtbronnen",
		helpText: "Wat helpt de leerling en welke talenten ondersteunen de ontwikkeling?",
		options: { theme: "Sterke punten en kansen" },
	},
	{
		key: "coach_kansen",
		section: "coach",
		type: "long_text",
		label: "Mogelijkheden en kansen",
		helpText: "Hoe kunnen talenten en krachtbronnen verder worden benut en versterkt?",
		options: { theme: "Sterke punten en kansen" },
	},
	// Thema "Voorkeur begeleiding"
	{
		key: "coach_voorkeur_begeleiding",
		section: "coach",
		type: "long_text",
		label: "Voorkeur begeleiding",
		helpText: "Hoe wil de leerling ondersteund worden? Digitaal, face-to-face of een mix?",
		options: { theme: "Voorkeur begeleiding" },
	},
	// Thema "Ondersteuning en activiteiten"
	{
		key: "coach_activiteiten",
		section: "coach",
		type: "long_text",
		label: "Wat gaan wij doen?",
		helpText: "Welke activiteiten en ondersteuning? Bijv. praktijklessen, begeleiding bij plannen.",
		options: { theme: "Ondersteuning en activiteiten" },
	},
	{
		key: "coach_hulpmiddelen",
		section: "coach",
		type: "long_text",
		label: "Welke hulpmiddelen en strategieën gebruiken we?",
		helpText: "Bijv. digitale planners, buddy-systemen, praktijkgerichte opdrachten.",
		options: { theme: "Ondersteuning en activiteiten" },
	},
	{
		key: "coach_verantwoordelijk",
		section: "coach",
		type: "short_text",
		label: "Wie is verantwoordelijk?",
		options: { theme: "Ondersteuning en activiteiten" },
	},
	{
		key: "coach_evaluatie",
		section: "coach",
		type: "long_text",
		label: "Wanneer en hoe evalueren we?",
		helpText: "Hoe en wanneer evalueren we of het goed gaat?",
		options: { theme: "Ondersteuning en activiteiten" },
	},
	// Thema "Overige (optioneel)"
	{
		key: "coach_afwijking_programma",
		section: "coach",
		type: "long_text",
		label: "Afwijkingen van het onderwijsprogramma",
		helpText: "Welke afwijkingen zijn nodig, waarom en voor hoe lang? (optioneel)",
		options: { theme: "Overige (optioneel)" },
	},
	{
		key: "coach_vervangende_doelen",
		section: "coach",
		type: "long_text",
		label: "Vervangende onderwijsdoelen",
		helpText: "Welke doelen, hoe passen ze bij de talenten en hoe meten we ze? (optioneel)",
		options: { theme: "Overige (optioneel)" },
	},
	{
		key: "coach_afwijking_tijd",
		section: "coach",
		type: "long_text",
		label: "Afwijking van onderwijstijd",
		helpText: "Welke afspraken, hoe lang gelden ze en hoe passen we de begeleiding aan? (optioneel)",
		options: { theme: "Overige (optioneel)" },
	},
];

/**
 * Insert all questions of `QUESTIONS` into `templateId`, then wire the
 * leerling→coach correspondences (#18). Returns nothing.
 */
async function insertQuestions(templateId: string): Promise<void> {
	await db.insert(formQuestion).values(
		QUESTIONS.map((q, i) => ({
			templateId,
			section: q.section,
			type: q.type,
			label: q.label,
			helpText: q.helpText ?? null,
			required: q.required ?? false,
			position: i,
			options: (q.options ?? null) as never,
		})),
	);
	// Resolve key → inserted id via position (position === index in QUESTIONS).
	const rows = await db
		.select({ id: formQuestion.id, position: formQuestion.position })
		.from(formQuestion)
		.where(eq(formQuestion.templateId, templateId))
		.orderBy(asc(formQuestion.position));
	const idByKey = new Map<string, string>();
	for (const r of rows) {
		const q = QUESTIONS[r.position];
		if (q) idByKey.set(q.key, r.id);
	}
	// Apply correspondences.
	for (const q of QUESTIONS) {
		if (!q.mapsToKey) continue;
		const selfId = idByKey.get(q.key);
		const targetId = idByKey.get(q.mapsToKey);
		if (!selfId || !targetId) continue;
		await db
			.update(formQuestion)
			.set({ mapsToQuestionId: targetId })
			.where(eq(formQuestion.id, selfId));
	}
}

/**
 * Copy every question of `srcTemplateId` into `destTemplateId`, preserving the
 * leerling→coach correspondences by remapping `mapsToQuestionId` onto the copy
 * (correlated by position).
 */
async function copyQuestions(
	srcTemplateId: string,
	destTemplateId: string,
): Promise<void> {
	const srcQs = await db
		.select()
		.from(formQuestion)
		.where(eq(formQuestion.templateId, srcTemplateId))
		.orderBy(asc(formQuestion.position));
	await db.insert(formQuestion).values(
		srcQs.map((q) => ({
			templateId: destTemplateId,
			section: q.section,
			type: q.type,
			label: q.label,
			helpText: q.helpText,
			required: q.required,
			position: q.position,
			options: q.options,
		})),
	);
	const destQs = await db
		.select({ id: formQuestion.id, position: formQuestion.position })
		.from(formQuestion)
		.where(eq(formQuestion.templateId, destTemplateId))
		.orderBy(asc(formQuestion.position));
	const newIdByPos = new Map<number, string>();
	for (const r of destQs) newIdByPos.set(r.position, r.id);
	const posBySrcId = new Map<string, number>();
	for (const q of srcQs) posBySrcId.set(q.id, q.position);
	for (const q of srcQs) {
		if (!q.mapsToQuestionId) continue;
		const targetPos = posBySrcId.get(q.mapsToQuestionId);
		const selfNewId = newIdByPos.get(q.position);
		const targetNewId =
			targetPos === undefined ? undefined : newIdByPos.get(targetPos);
		if (!selfNewId || !targetNewId) continue;
		await db
			.update(formQuestion)
			.set({ mapsToQuestionId: targetNewId })
			.where(eq(formQuestion.id, selfNewId));
	}
}

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
					"De Ondivera-vragenlijst: Mijn Plan (leerling) en POPP (coach), met leervoorkeuren en leerling→coach correspondenties.",
				scope: "ondivera",
				organizationId: null,
			})
			.returning({ id: formTemplate.id });
		if (!tpl) throw new Error("Failed to create Ondivera template");
		await insertQuestions(tpl.id);
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
				description: "Schoolversie van de Ondivera-vragenlijst.",
				scope: "school",
				organizationId: school.id,
				parentTemplateId: tpl.id,
				isSchoolDefault: true,
			})
			.returning({ id: formTemplate.id });
		if (!schoolTpl) throw new Error("Failed to create school template");
		await copyQuestions(tpl.id, schoolTpl.id);
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
