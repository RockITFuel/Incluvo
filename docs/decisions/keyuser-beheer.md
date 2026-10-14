# Keyuser: beheer van leerlingen en coaches (INC-15 – INC-18)

Besluit 08-10-2026. Vervangt D1 ("een keyuser handelt als elke coach van de school").

## De keyuser begeleidt niet meer

- Menu: **Leerlingen, Coaches, Cursussen, Beheer, Formulieren**. Na inloggen
  komt de keyuser op Leerlingen (INC-16 AC6, voorlopig).
- Dashboard, Coachplannen, Chat en Assistent zijn weg voor de keyuser, en ook
  op de server dicht: `canAccessLeerling` laat de keyuser niet meer toe tot plan,
  taken, cursus, stemming of chat van een leerling, en `reachableLeerlingen`
  geeft de keyuser geen leerlingen. Beheer en Formulieren blijven zoals ze waren.
- Bestaande koppelingen met een keyuser als coach vervallen (migratie 0017).
- Open punt: een account heeft één rol. Iemand die keyuser én coach is, kan dat
  nu niet met één account zijn (INC-16 AC8 gaat uit van meerdere rollen).

## Leerling of coach toevoegen

- `person_profile` (1-op-1 met `user`) bewaart de schoolgegevens: ECK-ID,
  naamdelen, roepnaam, geboortedatum, geslacht, gebruikersnaam, foto-URL,
  start-/stopdatum Incluvo (leerling) of in-/uitdienst datum (coach), en status
  (Actief/Inactief). `user.name` is "roepnaam voorvoegsel achternaam".
- Het **ID** is een volgnummer dat het systeem maakt, getoond als L-00012 of
  C-00007; niet te wijzigen. Bestaande leerlingen en coaches kregen er een bij
  de migratie.
- Account en profiel worden in één transactie aangemaakt; daarna gaat de
  uitnodiging per mail (wachtwoord kiezen). Mislukt de mail, dan bestaat de
  persoon wel en kan de uitnodiging opnieuw via Beheer.
- E-mailadres en gebruikersnaam zijn uniek; de melding staat bij het veld.
- Alleen de keyuser van de school, ook buiten het scherm om (`people.*`).

## Koppelingen: vaste coach en vervanger

- `coach_assignment.kind` is `vast` of `vervanger`; per leerling hoogstens één
  van elk, en de vervanger is een ander dan de vaste coach.
- Een vervanger kan alleen bij een vaste coach. De vaste coach verwijderen kan
  pas als de vervanging is beëindigd; een nieuwe vaste coach kiezen kan altijd
  (de vorige verliest dan de toegang).
- Beide coaches hebben dezelfde toegang (voorlopig voorstel uit het ticket).
  Beëindigen van de vervanging haalt alleen de toegang van de vervanger weg; wat
  tijdens de vervanging is vastgelegd blijft.
- De oudere aan/uit-knop in Beheer → Koppelingen volgt dezelfde regels: de eerste
  coach wordt vaste coach, de tweede vervanger; de vaste coach weghalen maakt de
  vervanger vaste coach.
- Migratie 0017: per leerling werd de oudste koppeling vaste coach, de tweede
  vervanger; verdere koppelingen vervielen.
