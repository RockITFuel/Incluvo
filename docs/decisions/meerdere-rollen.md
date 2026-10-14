# Meerdere rollen per account (INC-24)

Besluit 14-10-2026.

## Model

- `assigned_role` bevat alle rollen van een gebruiker; `user.role` is de
  **actieve** rol. Sessie, `context.actor`, menu en elke toegangscheck lezen de
  actieve rol, zoals voorheen. Wisselen (`account.switchRole`) zet alleen
  `user.role`, en alleen naar een rol die de gebruiker heeft.
- De actieve rol blijft staan na uitloggen: wie weer inlogt, werkt verder in de
  laatst gebruikte rol (AC9). Er is (nog) geen rolkeuze bij de eerste inlog.
- Een trigger op `user.role` zorgt dat de actieve rol altijd ook een toegewezen
  rol is (nieuw account, seed, rolwijziging). Wijzigingen in `assigned_role`
  staan in de audit-log.
- Vragen over een ánder ("is dit een coach?", lijsten van coaches, keyusers die
  een melding krijgen, de schoolstatistiek) kijken naar alle rollen
  (`hasRole`/`rolesByUser` in `apps/server/src/roles.ts`), niet naar de rol
  waarin iemand nu werkt. Zo blijft een keyuser-en-coach in keyuser-modus
  gewoon de coach van zijn leerlingen (AC13).

## Welke rollen samengaan

- Ontwikkelaar, coach en keyuser combineren vrij (`rolesCombine`).
- Een leerling is alleen leerling; de superadmin (Ondivera, geen school) alleen
  superadmin.
- Een rol afpakken: koppelingen die niet meer passen vervallen (geen coachrol →
  geen koppelingen als coach). Was het de actieve rol, dan werkt de gebruiker
  verder in de hoogste overgebleven rol (AC11).

## Beheer

- Beheer → Gebruikers: per gebruiker de rollen als labels en een knop *Rollen*
  met een schakelaar per rol. Uitnodigen van een bestaand account voegt de rol
  toe als die samengaat, en vervangt de rollen anders.
- Rolwisselaar: in het menu met de naam, onder *Werken als*, alleen bij meer dan
  één rol (AC12). Na het wisselen wordt alle gecachte data van de vorige rol
  weggegooid en opent het startscherm van de nieuwe rol (AC5).

## Nog niet

- Eén rol in meerdere scholen (AC8, tweede deel): een account hoort bij één
  school.
- AC10: wisselen houdt niet-opgeslagen invoer niet tegen. De rolwisselaar zit
  niet in de schermen van de leerling (een leerling heeft één rol); bij coach-
  en beheerschermen gaat wat nog niet is opgeslagen verloren.
