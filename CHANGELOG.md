# Changelog

## Release oktober 2026

Vergeleken met de versie die nu op productie draait (`c0564ac`, 2 september 2026).
Jira: INC-1, INC-3 t/m INC-9 en INC-12 t/m INC-14.

### Coachplan

- **Ingeleverd plan teruglezen en nog aanpassen (INC-14).** Na het inleveren ziet de leerling
  onder *Mijn plan* wat er is ingeleverd, met de markeringen *Bespreken met coach* en
  *Overgeslagen*. Zolang de coach nog niet is begonnen, kan de leerling via *Antwoorden aanpassen*
  nog dingen wijzigen. De coach ziet die wijzigingen meteen. Zodra de coach iets typt, plakt of
  kiest in het coachgedeelte, of het plan aanbiedt, staan de antwoorden vast. De leerling krijgt
  dan te zien dat de coach is begonnen. Wat op dat moment nog niet was opgeslagen, blijft
  zichtbaar zodat de leerling het kan kopiëren.
- **De coach ziet alle antwoorden van de leerling (INC-12).** Op de coachplanpagina staat een
  overzicht van alle antwoorden van de leerling, met de markeringen.
- **Antwoorden gaan niet meer verloren (INC-1).** Snel typen kon ertoe leiden dat een oudere
  opslag een nieuwere overschreef. Nu wordt per vraag in volgorde opgeslagen. Bij *Opslaan &
  afsluiten* en *Verzenden* wacht de app tot alles is opgeslagen. Wie het tabblad sluit terwijl
  er nog iets wordt opgeslagen, krijgt eerst een waarschuwing.
- **"Sla over" en "Bespreken met coach" werken weer (INC-13, INC-3).** Bij een vraag zonder
  eerder antwoord gaf de knop een fout en ging de wizard niet verder.
- **Eén plan per leerling, met versies.** Een gedeeld plan is alleen-lezen. Met *Plan bijwerken*
  begint de leerling een nieuwe versie, met de eerdere antwoorden al ingevuld. Het laatst gedeelde
  plan blijft gelden tot de coach de nieuwe versie deelt.
- **Formulieren als concept of gepubliceerd (INC-7).** Een wijziging aan een formulier is eerst
  een concept. Pas na *Publiceren* krijgen leerlingen het te zien. Per vraag stel je in of de
  leerling die vraag (en het antwoord erop) in het plan en de pdf ziet. Een nieuwe versie van het
  Ondivera-formulier neemt de school pas over als die daar zelf voor kiest.
- Antwoorden van de leerling die naar een coachvraag zijn gekopieerd, staan nu als het antwoord
  van de coach op één plek. De pdf, het AI-advies en het scherm tonen dus hetzelfde.

### Taken en cursussen

- **"Taak aanmaken" voor een leerling (INC-5)**, vanuit het snelpaneel op het dashboard: titel
  (max. 64 tekens), datum (typen of kiezen) en toelichting. De leerling krijgt een melding.
- **Taken voor vandaag kloppen (INC-4).** Een taak die te laat is, staat onder *Vandaag* met het
  label *Te laat*. 's Ochtends komt er een melding met de taken van die dag. Tijden gelden in de
  Nederlandse tijdzone.
- **Taak voor de hele klas verwijderd (INC-9)**, net als andere knoppen die niets deden.
- Een opdracht is klaar zodra hij is ingeleverd: de taak, de voortgang en de inlevering lopen
  gelijk op. Een opdracht afvinken zonder in te leveren kan niet meer.
- Cursusforums en groepsopdrachten zijn weg. Een cursus is per leerling, dus er waren geen
  klasgenoten. Bestaande chatgesprekken van forums blijven leesbaar.
- Een schoolkopie van een cursus laat zien wanneer de bron is gewijzigd.

### Chat

- **Bijlagen versturen (INC-8)** met de paperclip, plus een werkende knop *Nieuw gesprek*. De
  bel- en videoknoppen zijn weg.

### Gebruikers en scholen

- **Uitnodigen werkt (INC-6).** Zelf registreren kan niet meer: accounts ontstaan alleen via een
  uitnodiging. De uitgenodigde krijgt een mail met een link om een wachtwoord in te stellen
  (7 dagen geldig). In het gebruikersoverzicht staat *Uitgenodigd* of *Actief*, en een
  uitnodiging kan opnieuw worden verstuurd. Op de loginpagina staat *Wachtwoord vergeten?*.
- **Koppelingen coach ↔ leerling beheren.** De keyuser bepaalt welke coach welke leerlingen
  begeleidt. Een coach ziet alleen de eigen leerlingen.
- **Superadmin-beheer:**
  - een platformoverzicht;
  - per school een pagina;
  - gebruikers met een kolom en filter op school, en uitnodigen voor een gekozen school;
  - scholen archiveren;
  - een **cursuscatalogus** (*Beheer → Cursussen*) met beschikbaarheid per school en
    categorieën om te filteren.

  De superadmin ziet geen leerlinggegevens (geen chat, plannen of taken van leerlingen).
- Elke rol ziet alleen de menu-items en schermen die bij die rol horen.

### Dashboard en algemeen

- Het dashboard heeft paginering, de kolom *Laatst actief* heeft meer ruimte, de icoonknoppen
  hebben tooltips en het dashboard laadt sneller.
- Foutmeldingen staan in gewone taal en zijn te onderscheiden van "nog niets hier".
- **Toegankelijkheid (WCAG AA):**
  - tekst schaalt mee met de tekstgrootte-instelling en met die van de browser;
  - alle pagina's passen op een telefoon van 320 px;
  - elke pagina heeft een titel en focus;
  - een schermlezer hoort het als je naar een andere pagina gaat.
- Bewaartermijnen staan voorlopig op onbeperkt. In *Instellingen* zijn ze alleen te bekijken.

### Beveiliging en privacy

- Inlogpogingen zijn beperkt per IP-adres (het echte adres achter Cloudflare) en per
  e-mailadres.
- AI-advies: de naam van de leerling gaat niet naar de AI-aanbieder. Het plan gaat mee als
  gemarkeerde gegevens en niet als instructie. Antwoorden van de AI worden ondertekend, zodat ze
  niet te vervalsen zijn.
- De audit-log bewaart van chat, antwoorden en andere vrije tekst van leerlingen geen kopie
  meer, alleen het id. Bestaande kopieën worden opgeschoond.
- Vertalen en uploaden kan alleen door leden van een school, en uploads zijn begrensd.

### Voor de beheerder

- **Database-migraties 0005–0016** draaien automatisch bij het opstarten van de server. Ze:
  - ruimen dubbele rijen op en voegen unieke sleutels toe;
  - zetten coachplannen om naar versies (lege concepten vervallen);
  - verwijderen de tabellen `item` en `membership` en de cursusforums;
  - zetten de rollen `admin` en `member` om naar `superadmin` en `leerling`;
  - schonen de audit-log op.

  Lokaal getest vanaf het schema van `c0564ac` met data in alle statussen. Maak vóór de deploy
  een backup van de database.
- Omgevingsvariabelen, allemaal optioneel:
  - `SMTP_USER`, `SMTP_PASS` en `SMTP_SECURE` voor de mail via Cloudflare;
  - `AUTH_IP_HEADER`;
  - `AUDIT_RETENTION_DAYS` (standaard 730).
