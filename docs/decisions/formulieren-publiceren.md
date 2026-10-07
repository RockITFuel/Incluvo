# Formulieren: concept, publiceren en zichtbaarheid per vraag (INC-7)

Besluit 02-10-2026.

## Concept en gepubliceerd

- Een formulierversie is een **concept** (`form_template.published_at` leeg) of
  **gepubliceerd**. In een concept kunnen vragen worden toegevoegd, gewijzigd en
  verwijderd; een gepubliceerde versie ligt vast (AC2, AC3).
- Alleen een gepubliceerde versie kan de standaard van een school worden, aan
  een leerling gekoppeld worden, naar een school gekopieerd worden en gebruikt
  worden voor een plan. Een Ondivera-concept wordt scholen niet als update
  aangeboden.
- "Nieuwe versie maken" start een concept vanaf de nieuwste versie; de
  gepubliceerde versie blijft bestaan (AC4). Eén concept per formulier tegelijk;
  een concept kan worden verwijderd, een gepubliceerde versie niet.
- Een kopie naar school en "bijwerken vanaf de bron" leveren direct een
  gepubliceerde versie op (een ongewijzigde kopie van iets gepubliceerds).
- Bestaande formulieren zijn bij de migratie (0016) als gepubliceerd gemarkeerd.

## Zichtbaarheid per vraag

- `form_question.visible_to_leerling`, standaard aan (AC10). Uit: de leerling ziet
  de vraag en het antwoord niet in het coachplan, wie het antwoord ook gaf
  (AC11, AC12). Dat filter zit op de server (`getSubmission`, de pdf).
- De eigen vragen van de leerling blijven in de wizard staan zolang het plan
  een concept is; na inleveren gelden ze zoals ingesteld.

## De open vragen uit het ticket

1. **Waarop worden vragen gemapt (AC8)?** Al aanwezig: elke vraag heeft een
   stabiele `key` die over versies en kopieën gelijk blijft; bij het herzien
   van een plan gaan antwoorden mee per `key`, nooit op positie of tekst (AC9).
   Een expliciet scherm om vragen met een andere `key` te koppelen is er nog
   niet.
2. **Gestarte invullingen bij een nieuwe versie?** Blijven op hun eigen versie
   (het voorstel uit het ticket; zo werkte het al).
3. **Geldt een gewijzigde zichtbaarheid ook voor bestaande antwoorden?**
   Zichtbaarheid hoort bij de vraag en dus bij de versie (AC3). Een wijziging
   geldt voor plannen op de nieuwe versie; bestaande plannen houden de
   instelling van hun versie. Even bespreken met Mark of dat goed is.
