# Formulieren: invoegen, leerlingvraag, meerkeuze en voorbeeld (INC-29, INC-31, INC-32, INC-34)

Besluit 27-10-2026. Bouwt voort op [formulieren-publiceren.md](formulieren-publiceren.md) (INC-7).

## Vraag invoegen op een plek (INC-34)

- Elke vraag in een concept heeft *+ Vraag ervoor* en *+ Vraag erna*.
  *+ Vraag toevoegen* bovenaan zet een vraag achteraan, ook in een leeg formulier.
- `questions.create` met `anchor: { questionId, place }`. De server nummert de
  posities van het formulier opnieuw (0, 1, 2 …) in de huidige volgorde, met
  ruimte voor de nieuwe vraag. Alles in één transactie.
- De nieuwe vraag krijgt het **gedeelte en thema van de vraag waarnaast** hij
  komt. De wizard en het overzicht groeperen per gedeelte en thema; zonder dat
  zou een tussengevoegde vraag ergens anders verschijnen dan in de bouwer.
- Geen koppeling (`mapsToQuestionId`) op de nieuwe vraag (AC6). Na invoegen
  krijgt het veld *Vraag* van de nieuwe vraag de focus (AC2).
- Een gepubliceerde versie blijft dicht; aanpassen gaat via *Nieuwe versie
  maken* (AC7, bestaande regel).

## Leerlingvraagstelling (INC-31)

- Nieuwe kolom `form_question.leerling_label` (migratie 0020), leeg = geen.
  Hoort bij de vraag en dus bij de versie, net als de vraag zelf; wordt
  meegenomen bij een nieuwe versie, een kopie naar school en bijwerken vanaf
  de bron.
- De server kiest de formulering: de leerling krijgt in `startMine`,
  `getSubmission` en zijn eigen pdf `label = leerling_label` als die is
  ingevuld. Coach, keyuser, de pdf van de coach en het AI-advies lezen altijd de
  gewone vraag. Zo gebruikt elke plek voor de leerling (wizard, overzicht,
  *Mijn plan*, *Van je coach*) vanzelf de leerlingtekst.
- Ook bij coachvragen in te vullen: die ziet de leerling na delen als
  *Zichtbaar voor leerling* aan staat.
- Leeg maken (of alleen spaties) haalt de leerlingtekst weg. Antwoorden worden
  nooit aangeraakt (AC7).

## Meerkeuze en antwoordopties (INC-29)

- In de bouwer is er één type *Meerkeuze* met *Antwoordmogelijkheden*:
  - *Eén optie mogelijk* = het bestaande type `single_choice`;
  - *Meerdere opties mogelijk* = `multiple_choice`;
  - *Meerdere opties en vrij veld* = `multiple_choice` met
    `options.allowOther = true`.
  Zo blijven bestaande vragen en antwoorden werken; geen enum-migratie.
- Opties worden in de vraagkaart bewerkt (toevoegen, tekst aanpassen, omhoog,
  omlaag, verwijderen) en met *Opties opslaan* bewaard. Elke optie houdt een
  vaste waarde; een andere tekst of volgorde verandert gegeven antwoorden niet.
- Opslaan vraagt minstens twee opties met tekst (bouwer én server). Een lege
  optie of alleen spaties geeft een melding; wat er staat blijft staan (AC3).
- Wie het type op *Meerkeuze* zet, heeft nog geen opties. Dat mag in het
  concept, maar **publiceren weigert** een meerkeuzevraag met minder dan twee
  opties en noemt de vraag.
- Antwoord: de gekozen opties in `value_json` (lijst), het vrije veld in
  `value`. Het vrije veld is één tekstveld "Eigen antwoord (mag je leeg
  laten)"; alleen spaties telt als leeg. In het overzicht, bij de coach, in de
  pdf en in het AI-advies staat het vrije antwoord achter de gekozen opties.
- **Verplicht**: de kolom `required` bestaat, maar de bouwer heeft er (nog)
  geen schakelaar voor en de wizard dwingt hem niet af: een leerling kan elke
  vraag bewust overslaan. De drie varianten volgen dat zoals het is (AC10).
  Wel telt een antwoord van alleen spaties in het vrije veld nergens als
  antwoord (AC8). Een echte verplichting is een apart ticket.
- Coachvragen van het type meerkeuze bewaren hun opties nu ook lokaal; eerder
  ging een tweede klik uit van de oude selectie.

## Voorbeeld (INC-32)

- *Voorbeeld bekijken* in de bouwer opent een venster boven de bouwer, met
  *Coach* en *Leerling* als schakelaar (de actieve knop is ingedrukt en de tekst
  ernaast zegt welke weergave je ziet).
- Het voorbeeld toont de opgeslagen vragen van de versie die open staat, ook
  van een gepubliceerde versie. De bouwer slaat elk veld op bij het verlaten,
  dus wijzigingen zijn er meteen; alleen nog niet opgeslagen antwoordopties
  zie je pas na *Opties opslaan*. De bouwer blijft eronder staan, dus er gaat
  niets verloren bij openen of sluiten.
- *Leerling*: de vragen van het leerlinggedeelte per thema in de leerlingtekst,
  invulbaar. Vragen die na inleveren verborgen zijn, krijgen een label (zoals
  in de wizard ziet de leerling ze tijdens het invullen wel). Daaronder de
  coachvragen die de leerling na delen ziet.
- *Coach*: de coachvragen per thema in de gewone tekst, invulbaar (tekstvragen
  als tekstvak, zoals op de coachpagina), en de lijst leerlingvragen waarvan de
  coach de antwoorden leest.
- Proefantwoorden staan alleen in het venster; er gaat geen verzoek naar de
  server, er komt geen plan of toewijzing. Sluiten en weer openen begint leeg.
- Niet in het voorbeeld: de stap per stap-navigatie van de wizard en de
  leervoorkeurenstap van de coach. Het voorbeeld toont alle vragen op één
  pagina.
