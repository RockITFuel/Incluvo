# Superadmin (Ondivera) beheer — platformoverzicht, schooldetail, archiveren

Voorstel en uitwerking, 01-10-2026. Bouwt voort op #60 (admin omgeving).
Openstaand bij Mark: QUESTIONS 9.2 (welke beheerfuncties minimaal).

## Probleem

De superadmin mag server-side alles over scholen heen (`sameTenant` geeft
altijd `true`), maar de app was daar niet op ingericht:

- `/dashboard` toonde het coach-dashboard met álle leerlingen van alle scholen
  door elkaar, zonder schoolkolom.
- Beheer → Gebruikers toonde iedereen, ook zonder school; uitnodigen kwam altijd
  in de Ondivera-organisatie terecht. Een eerste keyuser voor een nieuwe school
  aanmaken kon dus niet via de app.
- Scholen: alleen tellingen, aanmaken en hernoemen. Niet doorklikken, niet
  archiveren.

## Voorstel 3 — platformoverzicht als startpagina van de superadmin

`/dashboard` toont voor de superadmin het **platformoverzicht** in plaats van
het coach-dashboard (keyuser en coach houden hun dashboard).

- **KPI-rij:** actieve scholen · leerlingen · coaches · coachplannen die wachten
  op beoordeling (over alle scholen).
- **Scholentabel:** naam · keyusers · coaches · leerlingen · plannen open ·
  laatst ingelogd (iemand van die school) · actie *School openen*.
  Filter *Actief / Zonder keyuser / Gearchiveerd*, zoeken, paginering.
- **Aandacht:** een school zonder keyuser krijgt een chip *Geen keyuser* —
  dat is precies de situatie na *Nieuwe school* en vraagt een volgende stap.
- **Actie:** *Nieuwe school* rechtsboven; na aanmaken ga je direct naar de
  schoolpagina om de keyuser uit te nodigen.

Data: één procedure (`admin.organizations.listAll`, uitgebreid) met gegroepeerde
tellingen — geen query per leerling zoals het coach-dashboard, dus het blijft
snel bij veel scholen.

## Voorstel 4 — schooldetailpagina

Nieuwe route `/beheer/scholen/$organizationId` (alleen superadmin).

- **Kop:** naam, badge *School*/*Ondivera*, *Gearchiveerd* indien van
  toepassing; acties *Naam wijzigen* en *Archiveren* / *Herstellen*.
- **Tegels:** keyusers · coaches · leerlingen · formulieren · cursussen.
- **Tabs:**
  - *Gebruikers* — alleen deze school; *Gebruiker uitnodigen* nodigt uit in
    déze school (rol kiezen, keyuser voorop als die nog ontbreekt).
  - *Formulieren* en *Cursussen* — de eigen templates van de school.
- Bereikbaar vanuit het platformoverzicht en vanuit Beheer → Scholen.

## 1 en 2 — gebruikersbeheer met school

- Beheer → Gebruikers (superadmin): kolom *School*, filter op school, zoeken op
  naam/e-mail. Rollen met Nederlandse labels.
- Uitnodigen (superadmin): verplichte schoolkeuze. Op de schoolpagina staat de
  school vast. De keyuser merkt niets: die nodigt altijd uit in de eigen school.

## 5 — wat wel en niet

- **Archiveren (gebouwd):** `organization.archived_at`. Een gearchiveerde school
  - kan niet meer inloggen (sessie aanmaken wordt geweigerd, bestaande sessies
    worden verwijderd en elke API-call krijgt *FORBIDDEN*);
  - krijgt geen nieuwe uitnodigingen;
  - houdt al haar gegevens; *Herstellen* maakt alles weer bruikbaar.
  Ondivera zelf kan niet gearchiveerd worden.
- **Verwijderen (niet gebouwd):** definitief wissen raakt bewaartermijnen en
  de verwerkersrol (QUESTIONS 4.1). Eerst beslissen, dan bouwen.
- **Gebruiker naar andere school verplaatsen (niet gebouwd):** plannen, taken,
  chats en notificaties van een leerling dragen de `organization_id` van de oude
  school. Verplaatsen betekent: meenemen (de nieuwe school ziet de historie) of
  achterlaten (de oude school blijft eigenaar). Dat is een AVG-keuze voor Mark,
  geen technische.

## Rollen en toegang (01-10-2026)

Ondivera beheert het platform en de sjablonen; het begeleidt geen leerlingen.
De superadmin heeft daarom **geen toegang tot inhoudelijke leerlinggegevens**
(plannen, taken, opdrachten, de eigen cursus van een leerling, chats, AI-advies)
— AVG-dataminimalisatie: de school is verwerkingsverantwoordelijke.

- `sameSchool(actor, resource)` (permissions/check.ts): als `sameTenant`, maar
  zonder uitzondering voor de superadmin. Gebruikt door de policies voor
  leerlinggegevens en door `canAccessLeerling`; `reachableLeerlingen` geeft
  voor de superadmin niets terug. `test/leerling-access.test.ts` heeft de
  superadmin bij de geweigerde rollen voor elk endpoint.
- `coachesLeerlingen(role)`: coach en keyuser. Bepaalt wie koppelingen kan
  hebben (een keyuser kan zelf coachen, D1), en welke pagina's open zijn
  (`requireRole(..., { coaching: true })`, `<RequireRole coaching>`).
- Ontbreekt een rol voor een pagina, dan stuurt de guard naar de eigen
  startpagina van die rol (niet via `/`).

| Rol | Menu | Startpagina |
| --- | --- | --- |
| leerling | Welkom, Mijn taken, Cursussen, Mijn plan, Chat, Mijn profiel | /welkom |
| ontwikkelaar | Cursussen, Mijn profiel | /cursussen |
| coach | Dashboard, Coachplannen, Cursussen, Chat, Assistent | /dashboard |
| keyuser | coach + Beheer, Formulieren | /dashboard |
| superadmin | Overzicht, Cursussen, Beheer, Formulieren | /dashboard (platformoverzicht) |

Later, als het nodig blijkt: tijdelijke supporttoegang tot één school, met
toestemming van de keyuser en vastgelegd in de audit-log.
