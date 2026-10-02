# Cursuscatalogus: beschikbaarheid per school en categorieën

Besluit 02-10-2026. Ondivera bepaalt welke Ondivera-cursussen een school mag
gebruiken, en ordent de catalogus met categorieën. Er kunnen tientallen cursussen
en scholen zijn, dus alles is gebouwd op zoeken, filteren en pagineren.

## Beschikbaarheid

- Per Ondivera-sjabloon: **alle scholen** (ook scholen die later aansluiten) of
  **alleen geselecteerde scholen** (`course.available_to_all_schools`,
  tabel `course_school_availability`).
- **Een nieuw sjabloon staat dicht**: geen enkele school ziet het tot Ondivera
  het beschikbaar maakt. Zo kan een cursus eerst af. Bestaande sjablonen zijn bij
  de migratie (0015) voor alle scholen opengezet, zodat er niets verdween.
- Een school ziet een sjabloon dat niet voor haar openstaat nergens: niet in de
  lijst, niet bij openen (`loadReadable`), en kan er dus ook geen schoolkopie van
  maken. Al gemaakte schoolkopieën blijven van de school.
- Twee manieren om het in te stellen:
  - **per cursus** in de Cursuscatalogus (`/beheer/cursussen`): welke scholen;
  - **per school** op de schoolpagina → Cursussen: een schakelaar per cursus.
    Een cursus die voor alle scholen openstaat hier uitzetten, maakt er "alleen
    geselecteerde scholen" van met alle andere scholen aangevinkt.

## Categorieën

- Centraal, beheerd door Ondivera (Cursuscatalogus → Categorieën beheren).
- Een cursus kan in meerdere categorieën staan. Ondivera deelt zijn eigen
  sjablonen in; een school kan haar eigen schoolsjablonen in dezelfde
  categorieën plaatsen.
- Filteren op categorie kan in de catalogus, op de schoolpagina en op
  `/cursussen` (voor iedereen behalve leerlingen; alleen categorieën die in de
  getoonde cursussen voorkomen).
- Een categorie verwijderen haalt hem alleen van de cursussen af.

## Schermen

- **Superadmin:** menu Cursussen → `/beheer/cursussen` (Cursuscatalogus). Tabbladen
  Ondivera-cursussen en Cursussen van scholen (alleen-lezen), filters op
  categorie, beschikbaarheid of school, zoeken, paginering. `/cursussen` stuurt
  de superadmin hierheen.
- **Scholen:** `/cursussen` zoals voorheen, met zoeken en categoriefilter.

Server: `apps/server/src/procedures/courses/catalog.ts` (`courses.catalog.*`).
Tests: `apps/server/test/catalog.test.ts`.
