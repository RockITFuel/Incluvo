# Ondivera-vragenlijst (#18) + kennisdocumenten RAG (#20) — first setup

Implemented 28-06-2026 from Mark Timmermans' "Input Incluvo" e-mail (12-06-2026)
and its attachments. See `docs/feedback/2026-06-12-mark.md` for the source list.

## #18 — Ondivera-vragenlijst als seed + leerling→coach correspondentie

**Bron:** attachment "de Ondivera Vragenlijst Incluvo.docx" (Mijn Plan + POPP).

- **Seed** (`apps/server/src/seed-coachplan.ts`): de échte Ondivera-vragenlijst is
  nu de seed-template "Ondivera Mijn Plan (POPP)" — een leerling-gedeelte ("Mijn
  Plan", thema's Over mij / Hoe ik leer / Wat ik wil leren / Wat ik nodig heb,
  incl. een leervoorkeur-vraag #19) en een coach-gedeelte ("POPP": Algemene
  gegevens, Ontwikkelingsperspectief, Sterke punten en kansen, Voorkeur
  begeleiding, Ondersteuning en activiteiten, Overige optioneel). De vraag
  "Welke foto's wil je delen?" is **bewust weggelaten** (privacy, zoals Mark
  aangaf).
- **Correspondentie** (Mark: "als de leerling deze vraag beantwoordt, komt het
  antwoord in het POPP-antwoordvak van de coach"): nieuw veld
  `form_question.maps_to_question_id` (een leerlingvraag wijst naar een
  coachvraag). Bij **submit** maakt `applyCorrespondenceMappings` automatisch
  `answer_coach_mapping`-rijen aan, zodat het coach-gedeelte vóóringevuld
  opent — de coach kan elke waarde nog overschrijven (hergebruikt de bestaande
  #16-plumbing). Idempotent en niet-destructief.
- Schools kunnen eigen vragen toevoegen/aanpassen incl. de correspondentie
  (`questionsCreate`/`questionsUpdate` accepteren `mapsToQuestionId`) — dekt
  Mark's wens dat de school de vragenlijst kan aanpassen.
- Overslaan / "bespreken met coach" bestond al (#11–#14).

**Run:** `bun run --cwd apps/server seed:coachplan` (na `seed:demo`).

## #20 — Kennisdocumenten RAG-laag (pgvector + mock embeddings)

**Bron:** attachments 2a (UDL-strategieën, PDF), 2b (doelgroepanalyse
thuiszitters), 2c (manuscript digitale school). Algemeen referentiemateriaal —
**geen leerling-PII**, dus laag AVG-risico om te embedden.

- **Schema** (`packages/drizzle/src/schema/kennisdocument.ts`): `kennisdocument`
  + `kennisdocument_chunk` met een pgvector `vector(1536)` embeddingkolom
  (`KENNIS_EMBED_DIM`). `organization_id` NULL = Ondivera-globaal.
- **Provider** (`apps/server/src/ai/provider.ts`): `embed()` toegevoegd —
  echte EU-endpoint (`AI_EMBED_MODEL`, default `text-embedding-3-small`) óf een
  **deterministische mock** (hashing bag-of-words, L2-genormaliseerd) zodat
  ingestie + retrieval offline werken. Gevalideerd: gerelateerde teksten scoren
  hoger onder cosine dan ongerelateerde.
- **Ingestie** (`apps/server/src/seed-kennis.ts`): leest de geëxtraheerde
  teksten in `apps/server/seed-data/kennisdocumenten/` (+ `manifest.json`),
  chunkt (~1200 tekens, lichte overlap), embed per batch, slaat op. Idempotent
  (één globale doc per `sourceName`, chunks worden vervangen). Maakt ook de
  `vector` extensie + een hnsw cosine-index aan.
- **Retrieval** (`apps/server/src/ai/retrieval.ts`): embed de vraag van de
  coach, haal de dichtstbijzijnde chunks (globaal + eigen tenant) via
  `cosineDistance`, en voeg ze als contextblok toe aan de
  `adviceSystemPrompt`. Best-effort in de `assistant`-procedure: faalt retrieval
  (bijv. pgvector nog niet aan), dan gaat het advies gewoon door zonder RAG.

**Run-volgorde:** `db:pgvector` → `db:push` → `seed:kennis`. Image:
`pgvector/pgvector:pg18` (docker-compose).

### Bekende beperkingen (first setup)
- **Mock-embeddings zijn lexicaal**, niet semantisch — prima om de pijplijn te
  demonstreren, niet voor productie-kwaliteit antwoorden. Zet `AI_BASE_URL`/
  `AI_API_KEY`/`AI_EMBED_MODEL` (EU-resident) voor echte embeddings; de
  embeddingdimensie moet 1536 zijn (anders kolom-mismatch).
- **2c is een manuscript** — vóór publiek gebruik auteursrecht/toestemming
  checken.
- Geen UI om kennisdocumenten te beheren (alleen seed) — logische follow-up.
