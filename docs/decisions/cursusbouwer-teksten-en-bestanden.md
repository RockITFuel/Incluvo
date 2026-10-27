# Cursusbouwer: teksten, volledig scherm en bestanden (INC-25, INC-26, INC-27)

Besluit 22-10-2026. Gebouwd op Solid 2 (PR #17).

## Teksten (INC-25)

- Eén editor (`components/courses/rich-text-editor.tsx`, Tiptap v3 op
  `@tiptap/core`) voor de pagina en de omschrijving van een opdracht. Werkbalk:
  kop en tussenkop, vet, cursief, onderstrepen, opsomming, genummerde lijst,
  citaat, link, afbeelding, YouTube-video, ongedaan maken en opnieuw.
- Opslag blijft ProseMirror-JSON als tekst, in `content_block.body` en
  `assignment.description`. Een oude omschrijving zonder opmaak wordt bij
  openen omgezet in alinea's en zo getoond.
- De weergave (`rich-text-view.tsx`) loopt de JSON af en toont alleen wat de
  editor maakt. Links alleen met http(s) of mailto, video's alleen als
  YouTube-embed op basis van het id, afbeeldingen alleen uit de eigen opslag.
- De takenlijst krijgt de platte tekst van een opdracht (`richTextToPlain` op
  de server), niet de JSON.
- Ook (27-10-2026, op verzoek): tekst uitlijnen (links, midden, rechts),
  tekstkleur uit een vaste lijst van vier kleuren die goed leesbaar zijn
  (`lib/text-colors.ts`; de weergave neemt alleen die waarden over) en
  tabellen met een kopregel (rijen en kolommen erbij of weg). Een brede tabel
  scrolt in zijn eigen vak, niet de hele pagina.
- Plakken uit Word of Google Docs: alleen wat het schema kent blijft
  (koppen, vet, cursief, onderstrepen, lijsten, links). Afbeeldingen van
  elders vallen weg.

### Afbeeldingen in een tekst

- Eigen opslag-scope `inhoud/`: alleen PNG, JPG en WebP, te uploaden door wie
  cursusinhoud schrijft. Alt-tekst is verplicht.
- In het document staat de opslagsleutel, nooit een URL (links verlopen).
- Lezen mag wie een cursus kan lezen waarvan een pagina of opdracht de sleutel
  bevat (afgeleide kopieën delen de sleutel, net als bij een bestand-blok).

## Volledig scherm (INC-26)

- Toevoegen en bewerken op `/cursussen/:courseId/blok/:blockId` (`nieuw` voor
  een nieuw blok, met `?sectie=` en eventueel `?type=`). Elk blok heeft een
  knop *Bewerken*; dat kon eerder niet.
- Niet-opgeslagen wijzigingen: Annuleren, Esc, terug in de browser of het
  tabblad sluiten vraagt eerst (router `useBlocker`).
- Na opslaan opent de cursus op *Bouwen* (`?tab=bouwen&blok=`) met de focus
  op het blok.
- `courses.updateBlock` past nu ook de opdracht aan (naam, omschrijving,
  antwoordmogelijkheid, deadline). Taken die uit de opdracht zijn gemaakt
  krijgen de nieuwe naam en omschrijving; de nieuwe deadline alleen als de
  coach die voor die leerling niet had verzet.

## Bestanden bekijken (INC-27)

- PDF in een ingebedde viewer, afbeelding, audio en video met een speler.
  *Openen* en *Downloaden* staan er altijd bij, elk met een verse link
  (`courses.getFile` met `download: true` geeft `Content-Disposition:
  attachment`).
- Word, PowerPoint en Excel kan een browser niet tonen: die krijgen een
  downloadlink met naam en type. Omzetten naar PDF op de server zou kunnen;
  niet gebouwd. De viewer van Microsoft valt af (openbare link, bestand gaat
  naar Microsoft).
- Op een telefoon of tablet geen ingebedde PDF, maar *Openen* en
  *Downloaden*.
- Ook voor bestanden bij een ingeleverde opdracht en voor gesproken of
  video-feedback van de coach (antwoord in INC-27). De feedback ging eerder
  als `publicUrl` naar de browser; nu via `getFile`, met de toegangscheck.
