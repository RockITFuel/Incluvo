# Incluvo — rollen en flows

Hoe Incluvo in elkaar zit en hoe het werk door de app loopt, zoals de code het
op 01-10-2026 doet. Onderaan: wat beter kan.

Zie ook `docs/decisions/superadmin-beheer.md` (rollen en toegang) en
`docs/decisions/bewaartermijnen.md`.

---

## 1. Het plaatje

```mermaid
flowchart TD
    O["Ondivera (superadmin)<br/>platform, scholen, sjablonen"]
    O --> S1["School A"]
    O --> S2["School B"]
    S1 --> K["Keyuser<br/>beheert de school"]
    S1 --> C["Coach"]
    S1 --> L["Leerling"]
    S1 --> D["Ontwikkelaar<br/>bouwt cursussen"]
    C -- "koppeling" --- L
    K -. "kan ook coachen" .- L
```

- **Een organisatie** is Ondivera (één) of een school. Iedere gebruiker hoort bij
  precies één organisatie.
- **Ondivera** beheert het platform: scholen, sjablonen voor het coachplan en voor
  cursussen. Het begeleidt geen leerlingen en ziet hun gegevens niet.
- **De school** is eigenaar van de leerlinggegevens (verwerkingsverantwoordelijke).
- **De koppeling** coach ↔ leerling bepaalt wie een leerling begeleidt: alleen
  gekoppelde coaches zien plan, taken, cursus, stemming en chat van die leerling.

### Rollen

| Rol | Wie | Startpagina | Menu |
| --- | --- | --- | --- |
| superadmin | Ondivera | Overzicht (alle scholen) | Overzicht, Cursussen (catalogus), Beheer, Formulieren |
| keyuser | beheerder van een school | Dashboard | Dashboard, Coachplannen, Cursussen, Chat, Assistent, Beheer, Formulieren |
| coach | coach / docent | Dashboard | Dashboard, Coachplannen, Cursussen, Chat, Assistent |
| ontwikkelaar | bouwt cursussen voor de school | Cursussen | Cursussen, Mijn profiel |
| leerling | leerling (8–20 jaar) | Welkom | Welkom, Mijn taken, Cursussen, Mijn plan, Chat, Mijn profiel |

### Wie mag wat

| | superadmin | keyuser | coach | ontwikkelaar | leerling |
| --- | --- | --- | --- | --- | --- |
| Scholen aanmaken, archiveren | ✔ | | | | |
| Gebruikers uitnodigen, rollen | alle scholen | eigen school | | | |
| Koppelingen coach ↔ leerling | alle scholen | eigen school | | | |
| Coachplan-formulier beheren | Ondivera-sjabloon | schoolformulier | | | |
| Cursussjabloon bouwen | Ondivera-sjabloon | schoolsjabloon | | schoolsjabloon | |
| Leerling: plan, taken, cursus, stemming | | hele school | gekoppelde leerlingen | | eigen |
| 1-op-1-chat | | gekoppelde leerlingen | gekoppelde leerlingen | | eigen coaches |
| AI-advies, transcriptie | | ✔ | ✔ | | |
| Audit-log | alles | eigen school | | | |

Server: `packages/permissions` (`sameTenant`, `sameSchool`, `coachesLeerlingen`,
`canAccessLeerling`) en `apps/server/src/access.ts`. De UI-guards
(`requireRole`, `<RequireRole>`) zijn alleen gemak; de server beslist.

---

## 2. Flows

### A. Een school aansluiten

```mermaid
sequenceDiagram
    actor O as Ondivera
    actor K as Keyuser
    actor C as Coach
    actor L as Leerling
    O->>O: Overzicht → Nieuwe school
    O->>K: Uitnodigen als keyuser (schoolpagina)
    K->>K: Wachtwoord kiezen via mail
    K->>C: Coaches uitnodigen (Beheer → Gebruikers)
    K->>L: Leerlingen uitnodigen
    K->>K: Beheer → Koppelingen: coach ↔ leerling
    K->>K: Formulieren: Ondivera-formulier kopiëren, standaard maken
```

1. **Ondivera** maakt de school aan; de schoolpagina toont "Volgende stap: nodig de
   keyuser uit" en het uitnodigformulier staat al op keyuser.
2. **Uitnodiging:** account zonder wachtwoord + mail met een link (7 dagen geldig)
   naar `/wachtwoord-instellen`. Zelf registreren kan niet.
3. **Keyuser** nodigt coaches en leerlingen uit en legt de koppelingen
   (filter "Zonder coach").
4. **Formulier:** de keyuser kopieert het Ondivera-coachplan naar de school
   (`templates.copyToSchool`) en maakt het de standaard.
5. **Cursussen:** de keyuser of ontwikkelaar maakt van een Ondivera-cursussjabloon
   een schoolsjabloon (`courses.derive`).

Een school stoppen: **Archiveren** op de schoolpagina — iedereen wordt uitgelogd,
inloggen en uitnodigen kan niet meer, de gegevens blijven. **Herstellen** maakt
het ongedaan.

### B. Het coachplan

```mermaid
stateDiagram-v2
    [*] --> draft: leerling start (Mijn plan)
    draft --> submitted: leerling levert in
    submitted --> coach_review: coach vult coach-gedeelte in
    submitted --> shared_with_leerling: coach deelt
    coach_review --> shared_with_leerling: coach deelt
    shared_with_leerling --> draft: leerling past aan (nieuwe versie)
```

1. **Leerling vult in** (`/plan`): een wizard die elk antwoord direct opslaat. Per
   vraag kan de leerling "overslaan" of "bespreken met coach" aangeven.
2. **Inleveren:** antwoorden die aan een coachvraag gekoppeld zijn, worden alvast in
   het coach-gedeelte gezet. Gekoppelde coaches krijgen een melding.
3. **Coach beoordeelt** (Coachplannen → plan): vult het coach-gedeelte (POPP) in,
   eventueel met:
   - **transcriptie** van een gesprek → conceptantwoorden om over te nemen;
   - **AI-advies** in de zijbalk (UDL, op basis van plan en kennisdocumenten; de
     naam van de leerling gaat niet mee);
   - **leervoorkeuren** vastleggen; "afgestemd met ouders" aanvinken.
4. **Delen:** de versie wordt "het plan" van de leerling; de leerling krijgt een
   melding en kan een PDF downloaden. Leervoorkeuren bepalen welke cursusinhoud
   als aanbevolen wordt getoond.
5. **Aanpassen:** de leerling start een nieuwe versie (antwoorden gaan mee); het
   gedeelde plan blijft geldig tot de volgende keer delen.

Formulieren hebben versies: een formulier dat in gebruik is, verandert niet; je
maakt een nieuwe versie. Een nieuwe Ondivera-versie kan een school overnemen
("bijwerken vanaf bron").

### C. Cursussen

```mermaid
flowchart LR
    A["Ondivera-sjabloon<br/>(superadmin)"] -- "afleiden" --> B["Schoolsjabloon<br/>(ontwikkelaar, keyuser)"]
    B -- "afleiden voor leerling" --> C["Cursus van de leerling<br/>(coach, keyuser)"]
    C --> T["Taak per opdracht"]
```

1. **Bouwen:** secties en blokken (tekst, media, bestand, opdracht), met labels per
   leervoorkeur.
   **Catalogus (Ondivera):** een nieuw Ondivera-sjabloon staat dicht; Ondivera
   maakt het beschikbaar voor alle of voor geselecteerde scholen en deelt het in
   categorieën in (`/beheer/cursussen`, of per school op de schoolpagina). Zie
   `docs/decisions/cursuscatalogus.md`.
2. **Afleiden voor een leerling** maakt een eigen kopie; elke opdracht wordt een
   taak in de takenlijst van de leerling.
3. **Leerling werkt:** voortgang per blok; aanbevolen inhoud volgens de
   leervoorkeuren uit het gedeelde plan.
4. **Opdracht inleveren** (tekst en/of bestanden) → de taak staat op klaar.
5. **Coach beoordeelt** met feedback → de leerling krijgt een melding.
6. **Eigen opdracht voorstellen** (leerling) → coach accepteert of wijst af.
7. **Bron gewijzigd:** als het Ondivera-sjabloon verandert, ziet de school dat en kan
   een nieuwe kopie maken.

### D. Taken

- Leerling ziet **Vandaag** (vandaag, vastgepind of te laat — die laatste met het
  label "Te laat"), **Toekomst** en **Klaar**; kan zelf taken toevoegen,
  afvinken en vastpinnen. "Vandaag" is de Nederlandse kalenderdag.
- Elke ochtend vanaf 07:00 krijgt een leerling met taken voor vandaag één
  melding (niet als een coach de lijst heeft verborgen).
- Coach of keyuser beheert de takenlijst van een leerling (profiel → Taken), kan
  taken toevoegen (leerling krijgt een melding) en de lijst tijdelijk verbergen
  (geldt voor de leerling, ook bij meerdere coaches).
- Taken uit een cursusopdracht gaan op klaar door in te leveren, niet door afvinken.

### E. Chat en meldingen

- **1-op-1-chat** alleen tussen een leerling en een gekoppelde coach of keyuser.
- **Meldingen** (bel rechtsboven, realtime):

| Melding | Wanneer | Voor |
| --- | --- | --- |
| Coachplan ingeleverd (met het aantal vragen om te bespreken) | leerling levert in | coaches* |
| Coachplan gedeeld | coach deelt | leerling |
| Opdracht ingeleverd | leerling levert een opdracht in | coaches* |
| Voorstel voor een opdracht | leerling stelt een eigen opdracht voor | coaches* |
| Opdracht beoordeeld | coach geeft feedback | leerling |
| Nieuwe taak | coach voegt een taak toe | leerling |
| Je taken voor vandaag | dagelijks vanaf 07:00 | leerling |
| Nieuw bericht | chatbericht | de ander |

\* De gekoppelde coaches; heeft de leerling geen coach, dan de keyusers van de
school (`leerlingCoachRecipients`).

### F. Hoe gaat het vandaag (stemming)

De leerling kiest op Welkom hoe het gaat en kiest zelf of de coach dat mag zien.
De coach ziet alleen gedeelde stemmingen (dashboard, profiel).

### G. Privacy en beheer

- Leerlinggegevens worden voorlopig **onbeperkt bewaard**; opnames worden niet
  opgeslagen; de audit-log 730 dagen.
- De **audit-log** legt vast wie wat wijzigde (zonder de inhoud van antwoorden).
- **AI** alleen via een EU-aanbieder; het plan gaat als gemarkeerde gegevens mee,
  de naam van de leerling niet.

---

## 3. Wat kan beter

### Opgelost (01-10-2026)

- Een leerling kan geen antwoorden meer in het coach-gedeelte schrijven.
- Meldingen voor een leerling zonder coach gaan naar de keyusers.
- "Takenlijst verbergen" geldt voor de leerling, ook bij meerdere coaches.
- Verouderde commentaren over de superadmin bijgewerkt.
- Taken over tijd staan onder Vandaag als "Te laat"; de dagelijkse melding
  "Je taken voor vandaag" wordt verstuurd; "vandaag" en "over tijd" volgen de
  Nederlandse kalenderdag (ook op het dashboard, dat een taak die vandaag af moet
  ten onrechte al als over tijd telde).
- De coach krijgt een melding bij een ingeleverde opdracht, een voorstel en
  (in de melding bij het inleveren) vragen om te bespreken.

### Moet voor livegang — gaten in de flow

1. **Server kan het, scherm ontbreekt:**
   - een ander formulier voor één leerling (`assignToLeerling`);
   - een deadline van een taak verplaatsen (`tasks.setDueDate`);
   - een cursus, sectie of blok bewerken of verwijderen (`courses.update`,
     `updateBlock`, …) — labels zijn na het aanmaken niet meer te wijzigen;
   - chat als gelezen markeren (`chat.markRead`).
2. **Geaccepteerd voorstel doet niets:** het wordt geen opdracht en geen taak.
3. **Groepsgesprekken (forums, #6) bestaan niet:** er is geen bloktype en geen code
   die ze aanmaakt, terwijl het meelezen voor coaches wel is gebouwd.
4. **Nieuwe formulierversie** wordt niet vanzelf de standaard, en leerlingen met
    een eigen formulier blijven op de oude versie.
5. **Inleveren controleert verplichte vragen niet.**

### Kan — beter maken

6. **Coach kan een gedeeld plan niet heropenen**; alleen de leerling kan een
    nieuwe versie starten.
7. **Bron gewijzigd** biedt alleen "nieuwe kopie maken", geen bijwerken met
    behoud van wat de school aanpaste.
8. **Melding aanklikken** gaat alleen bij chatberichten naar de juiste plek.
9. **Stemming** gebruikt nog de tijdzone van de server voor "vandaag"; taken
   gebruiken al de Nederlandse dag (`apps/server/src/time.ts`).
10. **Dode statussen** opruimen: coachplan `completed`, inzending `draft` en
    `returned`, transcriptie `pending`, `ai.deleteAudio` (er wordt geen audio
    opgeslagen).

### Besluit nodig (Mark)

11. School verwijderen en leerlingen verplaatsen tussen scholen (wie wordt
    eigenaar van de historie?).
12. Groepsgesprekken: wel of niet in de eerste versie?
13. Supporttoegang voor Ondivera tot een school (met toestemming en audit-log).
