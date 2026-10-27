# Nieuw coachplan toewijzen (INC-33) en notificaties die iets openen (INC-30)

Besluit 27-10-2026.

## INC-33: een nieuw coachplan

### Model

- Tot nu toe had een leerling één levend plan (D2) met versies. Nu kan een
  leerling meerdere `coachplan`-rijen hebben: het **actuele plan**
  (`replaced_at` leeg, hoogstens één per leerling, afgedwongen met een
  unieke index) en **eerdere plannen** (`replaced_at` gezet).
- "Plan bijwerken" (een nieuwe versie binnen hetzelfde plan) blijft zoals het
  was. Een nieuw plan is iets anders: een lege start op een gekozen
  formulier, versie 1 van een nieuw plan.
- `assigned_by_id` bewaart welke coach het plan startte; leeg als de leerling
  zelf begon (het standaardformulier).
- Toewijzingsdatum = de aanmaakdatum van het plan.

### Keuzes

- **Wie mag toewijzen (AC1):** een coach die de leerling begeleidt (vaste coach
  of vervanger, zoals `canAccessLeerling`). Niet de keyuser, niet de
  superadmin, niet de leerling.
- **Welke formulieren (AC2/AC3):** de gepubliceerde formulieren van de school
  van de leerling, per formulier de **nieuwste gepubliceerde versie**, met naam
  en versienummer. Oudere gepubliceerde versies van hetzelfde formulier bieden
  we niet aan: die zijn vervangen. Ondivera-formulieren worden pas bruikbaar als
  de school ze kopieert.
- **Lopend plan (niet gedeeld):** toewijzen mag ook als de leerling nog bezig
  is of de coach het coachgedeelte nog invult. De coach ziet dat in de dialoog.
  Het oude plan blijft met alle antwoorden bewaard, maar kan daarna door
  niemand meer worden ingevuld, ingeleverd of gedeeld (alleen-lezen).
- **Wat wordt "het plan" voor de leeromgeving:** de leervoorkeuren komen van
  het plan dat de coach het laatst deelde. Een nieuw plan dat nog niet gedeeld
  is, maakt de leeromgeving dus niet leeg; zodra het gedeeld is, gelden de
  labels van het nieuwe plan.
- **Plan bijwerken op een toegewezen plan:** blijft op hetzelfde formulier (in
  de nieuwste gepubliceerde versie). Een plan zonder toewijzing volgt zoals
  voorheen het formulier van de school / de koppeling (#10).
- **Dubbel toewijzen (AC9):** de coach stuurt het plan mee dat hij als actueel
  zag. Is dat inmiddels niet meer het actuele plan (tweede klik, ander
  tabblad, de andere coach), dan gebeurt er niets en krijgt hij een melding.
  Alles gebeurt in één transactie: mislukt het, dan blijft het actuele plan
  ongewijzigd.
- **Hetzelfde formulier nog eens (AC10):** mag; dat geeft een apart, leeg plan.
- **Melding aan de leerling:** een notificatie "Nieuw coachplan" (nieuw type
  `coachplan_assigned`); een open "Mijn plan"-pagina begint direct op het
  nieuwe plan.
- **Overzicht (AC6/AC7):** de coach ziet op de leerlingpagina het kaartje
  "Coachplannen": actueel plan bovenaan, eerdere plannen daaronder, met
  formuliernaam, versie, toewijzingsdatum, status en een link naar het plan
  (en naar elke versie). De leerling ziet op "Mijn plan" onder het actuele plan
  de eerdere plannen, uit te klappen met alle antwoorden.
- De coachinbox (Coachplannen) en het dashboard tonen alleen het actuele plan.

### Migratie 0020

Bestaande plannen worden het actuele plan (`replaced_at` leeg). De oude unieke
index (één plan per leerling) garandeerde al dat de nieuwe gedeeltelijke
index klopt. Geen datawijziging.

## INC-30: een notificatie opent waar hij over gaat

- Elke notificatie verwijst los naar een rij (`entity_type`/`entity_id`). Bij
  het openen (`notifications.open`) markeert de server hem als gelezen,
  controleert of de rij nog bestaat en of de gebruiker er nog bij mag, en
  geeft een doel terug. De web-app vertaalt dat doel op één plek naar een
  pagina (`components/notifications/notification-target.ts`).
- Doelen:
  - coachplan (ingeleverd, gedeeld, nieuw): de coach opent die versie van het
    plan; de leerling opent "Mijn plan" (bij een eerder plan klapt dat open).
  - taak: de takenlijst op het juiste tabblad, met de taak gemarkeerd en in
    beeld. De dagelijkse "taken voor vandaag" opent de takenlijst.
  - ingeleverde opdracht (coach): de cursus op "Beoordelen", bij die opdracht.
  - beoordeelde opdracht (leerling): de cursus met de opdracht opengeklapt; de
    beoordeling staat onder de inzendingen.
  - voorstel voor een opdracht (coach): de cursus, bij de voorstellen.
  - chat: het gesprek (zoals het al werkte).
  - een algemene melding zonder onderwerp opent niets en wordt alleen gelezen.
- Bestaat het onderdeel niet meer, of is de gebruiker er geen coach meer van
  (koppeling beëindigd), dan blijft hij op zijn plek en verschijnt een melding
  "Kan dit niet openen" met de reden. Er komt dan geen id of inhoud mee.
- Ook oude notificaties werken: ze hadden hun verwijzing al.
