# Product Backlog — Incluvo

> Bron: `Backlog Incluvo.xlsx` (Mark Timmermans / Ondivera, 24-04-2026), opgehaald uit e-mail "FW: Backlog etc." van Frank Bokkers.

> Prototype: https://g0x45795pgfaglr7yx3q.share.dreamflow.app/#/student/welkom


**Componenten:** Algemeen, Chat, Coachplan, Takenlijst, Online cursus, Dashboard coach  

**Gebruikersgroepen:** Alle gebruikers, Leerling, Coach/docent, Superadmin, Keyuser, Leerling/coach, Ontwikkelaar


Totaal uitgewerkte items: **46**


---


## Algemeen


### #1 — Voldoen aan de WCAG normen
_**Eis** · Alle gebruikers_


**Omschrijving:** WCAG zijn richtlijnen die digitale content toegankelijk maken voor iedereen, ook voor mensen met een beperking.

**Acceptatiecriteria:** Niveau AA

**Opmerkingen:** Waar mogelijk! 

Eventueel vertaaloptie met behulp van AI zou ook mooi zijn voor leerlingen (en ouders) die nog niet goed Nederlands spreken.
Zie ook dropdownmenu prototype zoals contrast, lettertype etc.


### #2 — Gehost bij voorkeur in Nederland, anders in Europa
_**Eis** · Alle gebruikers_


**Omschrijving:** Digitale soevereiniteit is een hot item binnen het onderwijs en tevens een verkoopargument


### #3 — Notificaties
_**Eis** · Leerling/coach_


**Omschrijving:** De leerling en coach krijgt notificaties vanuit de leeromgeving

**Acceptatiecriteria:** Minimaal bij verzenden en ontvangen van coachplan, taken voor vandaag, nieuwe taken, activiteiten binnen de leeromgeving.

**Opmerkingen:** Zie prototype


### #4 — Leerling vriendelijke landingspagina
_**Eis** · Leerling_


**Omschrijving:** Welkom en foto
Hoe zit jer erbij vandaag (smileys) (kan door coach/leerling worden uitgezet)
Jouw succcessen
Sociaal (chats)
Snelkoppelingen

**Acceptatiecriteria:** Zie omschrijving

**Opmerkingen:** Zie prototype


## Chat


### #5 — Chat coach/leerling
_**Eis** · Leerling/coach_


**Omschrijving:** Het chatgesprek tussen leerling en coach. Notificatie bij aparte chaticon

**Acceptatiecriteria:** Werkende chatfunctionaliteit

**Opmerkingen:** Zie prototype


### #6 — Groepschat, coach supervisor
_**Eis** · Leerling/coach_


**Omschrijving:** Dit betreft de chat/forum die gestart is binnen een cursus als opdracht met andere leerlingen. Coach van de leerling kan altijd meekijken

**Acceptatiecriteria:** Werkende chatfunctionaliteit

**Opmerkingen:** Zie prototype


### #7 — Chat coach/leerling
_**Wens** · Coach/docent_


**Omschrijving:** Mogelijkheid om een coachtaak (niet aan een cursus gerelateerd) te maken vanuit chatvenster

**Acceptatiecriteria:** Taak aanmaken binnen chatfunctionaliteit. Deze taak komt ook in de takenlijst.

**Opmerkingen:** Link naar de taak komt ook in de berichtenoverzicht van de chat en is aanklikbaar om naar de details van de taak te gaan.


## Coachplan


### #8 — Formulieren templates
_**Eis** · Superadmin_


**Omschrijving:** Mogelijkheid om meerdere formulierentemplates te maken en te kopiëren naar de omgeving van een klant zodat ze die kunnen aanpassen voor hun doelgroep.

**Acceptatiecriteria:** Er is een formulierenmanager beschikbaar.

**Opmerkingen:** Let op: enkele vraagtypes die nodig zijn als trigger naar de leeromgeving komt terug in alle formulieren. Elk formulier heeft een leerling gedeelte en coachgedeelte


### #9 — Formulieren templates gebruiken
_**Eis** · Keyuser_


**Omschrijving:** Een keyuser van een klant kan formulieren templates gebruiken, aanpassen of een volledig nieuwe samenstellen

**Acceptatiecriteria:** Er is een formulierenmanager beschikbaar op klantniveau.

**Opmerkingen:** Let op: enkele vraagtypes die nodig zijn als trigger naar de leeromgeving komt terug in alle formulieren. Elk formulier heeft een leerling gedeelte en coachgedeelte


### #10 — Formulier koppelen aan leerlingen
_**Eis** · Keyuser_


**Omschrijving:** Een klant kan aangeven welk formulier standaard gebruikt wordt binnen zijn school en kan per leerling een ander formulier koppelen.

**Acceptatiecriteria:** Standaard formulier aangeven op klantniveau en deze aanpassen.


### #11 — Vragen voor leerling
_**Eis** · Leerling_


**Omschrijving:** Er zijn diverse vragen die een leerling mag/kan invullen. Op basis van een wizard. De vragen worden tussentijds opgeslagen. Aan het eind van de vragenlijst kan de leerling de antwoorden sturen naar de coach

**Acceptatiecriteria:** Invullen formuliervelden

**Opmerkingen:** Zie prototype


### #12 — Keuze: bespreken met coach
_**Eis** · Leerling_


**Omschrijving:** Een leerling kan aangeven of hij een vraag specifiek wilt bespreken met de coach. Dit wordt benadrukt in de inzending.

**Acceptatiecriteria:** Optie bij het invullen van de vragenlijst

**Opmerkingen:** Zie prototype


### #13 — Keuze: bewust vraag overslaan
_**Eis** · Leerling_


**Omschrijving:** Een leerling kan aangeven of dat hij een vraag wilt overslaan. Dit wordt benadrukt in de inzending.

**Acceptatiecriteria:** Optie bij het invullen van de vragenlijst. Na aanklikken gaat de leerling naar de volgende vraag.

**Opmerkingen:** Zie prototype


### #14 — Overzicht antwoorden
_**Eis** · Leerling_


**Omschrijving:** De leerling krijgt een mooi overzicht van zijn antwoorden en de mogelijkheid om de antwoorden te bewerken

**Acceptatiecriteria:** Na het versturen van de vragenlijst krijgt de leerling een overzicht van zijn antwoorden

**Opmerkingen:** Zie prototype


### #15 — Antwoorden bekijken
_**Eis** · Coach/docent_


**Omschrijving:** De coach krijgt een notificatie van een ingeleverd coachplan en kan de antwoorden bekijken (inclusief de aandachtspunten zoals deze vraag is bewust overgeslagen of deze vraag wil ik graag bespreken met de coach

**Acceptatiecriteria:** Overzicht met antwoorden van leerlingen. Dit overzicht kan de coach niet aanpassen

**Opmerkingen:** Zie prototype


### #16 — Mapping van antwoorden op de vragenlijst van coach
_**Eis** · Coach/docent_


**Omschrijving:** Een aantal antwoorden worden gemapt op de vragenlijst van de coach (ingevuld door student). Deze kunnen worden aangepast.

**Acceptatiecriteria:** Antwoorden worden gemapt

**Opmerkingen:** Zie prototype, we hebben een overzicht van welke antwoorden leerling op welke plaats gemapt moet worden in de vragenlijst coach/docent


### #17 — Vragenlijst coach
_**Eis** · Coach/docent_


**Omschrijving:** Coach kan een aantal vragenbeantwoorden naar aanleiding van het gesprek met de leerling. Als de vragenlijst is ingevuld dan kan deze worden aangeboden aan de leerling.

**Acceptatiecriteria:** Invullen formuliervelden

**Opmerkingen:** Zie prototype


### #18 — Transcriptietool
_**Eis** · Coach/docent_


**Omschrijving:** Een optie binnen het coachgedeelte is dat de coach een gesprek met leerling kan opnemen. Dit kan een fysiek gesprek zijn of een gesprek via Teams/Zoom. De transcriptie wordt omgezet naar de formuliervelden in de vragenlijst die door Incluvo wordt aangeboden (dus niet eigen vragenlijsten!). De antwoorden kan door de coach worden aangepast.

**Acceptatiecriteria:** Transcriptie die doormiddel van AI een voorstel doet voor de antwoorden op de vragen.

**Opmerkingen:** Hierdoor kan de coach de volledige aandacht leggen op het overleg. Invullen van dit soort plannen kost veel tijd en energie


### #19 — Standaardlabels voorkeuren leeromgeving
_**Eis** · Coach/docent_


**Omschrijving:** De coach geeft in overleg met de leerling aan wat de leervoorkeuren zijn van de leerling. Dit element komt in alle formulieren terug. Deze zijn namelijk ook de triggers binnen de leeromgeving

**Acceptatiecriteria:** Aangeven leervoorkeuren

**Opmerkingen:** Zie prototype stap 6 van 8.


### #20 — PDF genereren
_**Eis** · Coach/docent_


**Omschrijving:** Het is mogelijk een PDF te genereren van een ingevuld coachplan (bijv. voor ouders of leerlingendossier)

**Acceptatiecriteria:** Genereren PDF

**Opmerkingen:** Zie prototype


### #21 — Plan afgestemd met ouders
_**Eis** · Coach/docent_


**Omschrijving:** Coach kan aangeven dat het plan is afgestemd met de ouders.

**Acceptatiecriteria:** Schuifje om aan te geven dat het plan is afgestemd

**Opmerkingen:** Later kan dit verder uitgebreid worden met een ondertekentool


### #22 — AI-assistent
_**Wens** · Coach/docent_


**Omschrijving:** Een AI-assistent die een advies geeft op basis van de informatie in het coachplan welke interventies deze leerling kan helpen.

**Acceptatiecriteria:** Popup die indien gewenst een advies geeft?

**Opmerkingen:** We hebben veel kennisdocumenten die gebruikt kunnen worden, daarnaast de bestaande LLM die ook kunnen helpen. Belangrijk is een goede prompt te maken.


## Takenlijst


### #37 — Takenoverzicht voor de leerling gesplits in vandaag en toekomst
_**Eis** · Leerling_


**Omschrijving:** Een takenlijst op basis van de taken (opdrachten) uit de leeromgeving en de taken die door de coach of leerling zijn aangemaakt.

**Acceptatiecriteria:** Overzicht met taken (te zien door leerling en coach. Taken met deadline vandaag komen onder vandaag te staan. De coach kan eventueel makkelijk de deadline van een taak (ook uit leeromgeving!) aanpassen.

**Opmerkingen:** Zie prototype


### #38 — Extra taken voor vandaag
_**Eis** · Leerling_


**Omschrijving:** Mogelijkheid om taken die niet onder vandaag staat aan te vinken zodat ze onder vandaag komen te staan

**Acceptatiecriteria:** Aanvinken extra taken die onder vandaag komen te staan

**Opmerkingen:** Zie prototype?


### #39 — Tijdelijk takenoverzicht uitzetten
_**Eis** · Coach/docent_


**Omschrijving:** Een coach kan tijdelijk voor een leerling de takenlijst uitzetten

**Acceptatiecriteria:** Oogje sluiten bij takenlijst door coach?


### #40 — Taken afvinken
_**Eis** · Leerling_


**Omschrijving:** Mogelijkheid om taken af te vinken

**Opmerkingen:** Zie prototype


### #41 — Mogelijkheid om taken toe te voegen
_**Eis** · Leerling/coach_


**Omschrijving:** Mogelijkheid om taken toe te voegen

**Acceptatiecriteria:** Door leerling en coach

**Opmerkingen:** Zie prototype


## Online cursus


### #23 — Beheer cursussen
_**Eis** · Keyuser_


**Omschrijving:** Er zijn drie type cursussen. Namelijk een "Ondivera Sjabloon" cursus, een "School Template" cursus en een cursus "Uitvoering voor een Leerling". Een Ondivera sjabloon kan gekopieerd worden naar een schooltemplate en de schooltemplate is de bron voor de leeromgeving van de leerling. De cursusfunctionaliteiten binnen de 3 type zijn hetzelfde.

**Acceptatiecriteria:** Mogelijkheid om deze cursussen afzonderlijk te beheren. Ondivera kan zo advies geven voor een inrichting van een cursus. De school kan hun eigen varianten beheren en de leerling heeft een eigen (kopie) omgeving (waar eventueel wijzigingen of extra materiaal/oefeningen aan kunnen worden toegevoegd (individueel niveau).

**Opmerkingen:** Hier even goed over nadenken wat het handigst is


### #24 — Voortgangsbalk bij cursussen
_**Eis** · Leerling/coach_


**Omschrijving:** Een voortgangsbalk boven de cursus op basis van de aanbevolen/actieve content/opdrachten

**Acceptatiecriteria:** Voortgangsbalk die op basis van bekeken/afgevinkte content en uitgevoerde opdracht de voortgang laat zien. De voortgangsbalk moet door een docent onzichtbaar gemaakt kunnen worden (oogje sluiten)


### #25 — Aanmaken secties binnen cursus
_**Eis** · Ontwikkelaar_


**Omschrijving:** Toevoegen van een sectie binnen een online cursus

**Acceptatiecriteria:** Aanmaken van een sectie doormiddel van een + icoon

**Opmerkingen:** Zie prototype: Een structurerend element waarmee je content in volgorde aanbiedt, op termijn inclusief voorwaarden (volg dit voordat je door mag)
Voorbeeld week 1, week 2, week 3 of thema 1, thema 2)


### #26 — Content binnen een sectie (CbS)
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijkheid om meerdere vormen van content (zie alle CbS'en) binnen een sectie toe te voegen.

**Acceptatiecriteria:** Aanmaken van een CbS doormiddel van een + icoon

**Opmerkingen:** Zie prototype. Misschien een andere manier van denken: WYSIWYG met knop opdracht en knop document koppelen een een + knopje voor de andere toepassingen (vraag toelichting Mark)


### #27 — CbS: Opdracht
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijkheid om een opdracht te maken binnen een sectie.

**Acceptatiecriteria:** Mogelijkheid om een opdracht aan te maken met de benoemde attributen.

**Opmerkingen:** Zie prototype.
Naam opdracht
Omschrijving opdracht
Individuele opdracht of groepsopdracht
Antwoordmogelijkheid (tekst en bestanden inleveren) (komt in takenlijst coach/docent)
Inleverpogingen
Inleverdatum en tijd
Beschikbaar van/tot
Inlegeleverde opdracht beoordelen (cijfer en teks en later een rubics) door coach/docent
(Toewijzen aan:)


### #28 — Beoordelen opdracht
_**Eis** · Leerling/coach_


**Omschrijving:** Een docent kan een ingeleverde opdracht beoordelen met een tekst, cijfer (niet verplicht) en een spraak of videobericht

**Acceptatiecriteria:** Mogelijkheid om de opdracht te beoordelen

**Opmerkingen:** Zie prototype


### #29 — CbS: pagina
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijkheid om een pagina aan te maken binnen een sectie.

**Acceptatiecriteria:** Mogelijk om een pagina aan te maken.

**Opmerkingen:** Vrij vorm te geven pagina doormiddel van een WYSIWYG en eventueel een blokdesigner


### #30 — CbS: bestanden
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijk om een bestand toe te voegen zoals een PDF, PowerPoint, Word, etc.

**Acceptatiecriteria:** Mogelijk om een bestand toe te voegen

**Opmerkingen:** Zie prototype


### #31 — CbS: Youtube link
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijk om een youtube link te plaatsen die via een player kan worden afgespeeld.

**Acceptatiecriteria:** Youtube filmpje via een player toevoegen

**Opmerkingen:** Zie prototype


### #32 — CbS: Forum/ groepschat
_**Eis** · Ontwikkelaar_


**Omschrijving:** Mogelijk om een forum/groepschat te starten.

**Acceptatiecriteria:** Mogelijkheid om een forum/groepchat te starten

**Opmerkingen:** Zie prototype


### #33 — CbS: LTI-content
_**Wens** · Ontwikkelaar_


**Omschrijving:** Mogelijkheid om Lti content te koppelen conform LTI standaard

**Acceptatiecriteria:** Koppelen van content van leverancier via beheer en ontwikkelaar kan dan content koppelen als item binnen een sectie.

**Opmerkingen:** Lti 1.3 of -advance


### #34 — CbS: Ondivera content advies overnemen
_**Wens** · Ontwikkelaar_


**Omschrijving:** Binnen het Ondivera Kennispunt (platform) zijn adviesarrangementen beschikbaar met inclusief leermateriaal vanuit diverse bronnen. Deze informatie kunnen selecteren en overnemen naar een item binnen de sectie

**Opmerkingen:** Expertisepunt is nog in ontwikkeling. De leverancier van PortalCMS levert een API oplossing.


### #35 — Aanbevolen en actieve content
_**Eis**_


**Omschrijving:** Voor de leerling wordt aanbevolen/actieve content op basis van de leervoorkeuren uit het plan zichtbaar. Andere keuzes worden ook beschikbaar via een uitklapmenu. Bij de andere keuzes kunnen ze deze bekijken. Als ze liever willen dat deze keuze als actief komt dan kunnen ze een signaalbericht sturen naar de coach. De coach moet deze dan aanpassen in het plan (en/of via de leeromgeving = nog bespreken, wat logisch is).


### #36 — Alle CbS'en labellen met leervoorkeuren uit plan
_**Eis** · Ontwikkelaar_


**Omschrijving:** Alle CbS'en moeten gelabeld worden met de leervoorkeuren die overeenkomen met het plan, zodat ze als aanbevolen en actief getoond kunnen worden op basis van de aangegeven leervoorkeuren in het plan


### #61 — Eigen opdracht voorstellen via leeromgeving
_**Wensn** · Leerling/coach_


**Omschrijving:** Een leerling kan ook zelf iets bedenken hoe hij wilt aantonen of hij iets geleerd heeft. Dit voorstel moet besproken worden met coach


## Dashboard coach


### #42 — Dashboard coach/docent
_**Eis** · Coach/docent_


**Omschrijving:** Dashboard met overzicht leerlingen, coachplan status, laatste activiteit, voortgang, aandachtsindicatie en snelacties (chat, naar plan)

**Acceptatiecriteria:** Exacte dashboard bespreken

**Opmerkingen:** Zie prototype


### #43 — Quickpanel coach/docent
_**Eis** · Coach/docent_


**Omschrijving:** Bij aanklikken van leerling komt er een Quickpanel in scherm. Hier staan wat snelle gegevens zoals leervooerkeuren, taken en actieve cursussen (link om de cursus op leerlingniveau aan te passen). Mogelijkheid om een bericht te sturen of een taak aan te maken.

**Acceptatiecriteria:** Exacte dashboard bespreken

**Opmerkingen:** Zie prototype


### #44 — Bekijken volledig profiel leerling
_**Eis** · Coach/docent_


**Omschrijving:** Mogelijkheid om het volledig profiel te bekijken.

**Acceptatiecriteria:** Exacte layout nog bespreken

**Opmerkingen:** Zie prototype


## Overig


### #60 — Admin omgeving voor school en ondivera
