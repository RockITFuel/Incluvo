# Vragen aan Mark Timmermans (Ondivera) — Incluvo

> Levend document. We werken de backlog uit op basis van `Backlog Incluvo.xlsx` (24-04-2026) en het prototype.
> Waar de backlog ruimte laat, maken we een **werkaanname** (zodat de bouw door kan) en noteren we de vraag hier.
> Per vraag: **Vraag**, onze **Werkaanname** (wat we nu bouwen) en ruimte voor **Antwoord Mark**.
>
> Status-legenda: 🔴 blokkerend · 🟡 belangrijk · 🟢 nice-to-know. Laatst bijgewerkt: 2026-06-06.

---

## 0. Proces
- **0.1** 🟡 Mogen we de backlog als levend document in onze repo beheren (deze markdown + de xlsx) en wijzigingen via een gedeeld kanaal (Teams) terugkoppelen, zoals je in je mail van 24-04 voorstelde?
- **0.2** 🟢 Wie is per component de inhoudelijke beslisser bij twijfel (jij, Kimberley, Marco/Herbert)?

## 1. MVP-scope & prioritering
Frank noemde dat we de exacte MVP-scope samen scherper moeten maken.
- **1.1** 🔴 Wat moet er in de **eerste werkende versie (MVP)** zitten om bij de start van het nieuwe schooljaar live te kunnen? Onze voorgestelde MVP-volgorde: (1) auth + rollen + multi-tenant, (2) Coachplan-flow leerling→coach, (3) Takenlijst, (4) Online cursus basis (secties + content + opdracht inleveren), (5) Chat, (6) Dashboard coach. **Akkoord?**
- **1.2** 🟡 De items met type **"Wens"** (#7 coachtaak vanuit chat, #22 AI-assistent, #33 LTI, #34 Ondivera-contentadvies, #61 eigen opdracht) parkeren we als post-MVP. Akkoord?
- **1.3** 🟡 Klopt het dat de doelgroep **afstandsonderwijs** is (8–20 jaar), en NIET thuisonderwijs/leerplichtvrijstelling? (uit jullie mailwisseling 04-06)

## 2. Doelgroep & UX (8–20 jaar)
Je gaf aan dat de huidige omgeving nog "overweldigend" overkomt voor deze leeftijd.
- **2.1** 🟡 Willen jullie één leerling-UI voor 8–20, of een **rustiger/eenvoudiger modus** voor jongere leerlingen (bv. minder tegels, grotere knoppen, meer beeld)? 
- **2.2** 🟢 Zijn er voorbeelden/scholen waarvan we de toon & beeldtaal mogen overnemen?
- **2.3** 🟡 #1 noemt een AI-**vertaaloptie** voor leerlingen/ouders die nog niet goed Nederlands spreken. Is dat MVP of wens? Welke talen minimaal?

## 3. Rollen, rechten & multi-tenant
De backlog noemt: Alle gebruikers, Leerling, Coach/docent, Superadmin, Keyuser, Ontwikkelaar, Leerling/coach.
- **3.1** 🔴 Klopt dit model: **Ondivera (superadmin)** > **Klant/School** (keyuser beheert) > **Coach/docent** + **Leerling**, en **Ontwikkelaar** = wie cursussen bouwt? Is "Ontwikkelaar" een aparte rol of een recht van keyuser/coach?
- **3.2** 🔴 Mag een leerling bij **meerdere scholen/coaches** horen, of altijd precies één tenant?
- **3.3** 🟡 Wie mag wat? Een korte rechtenmatrix (lezen/schrijven/beheren per component) zouden we graag samen invullen — concept maken wij, jij toetst.
- **3.4** 🟡 Hoe loggen gebruikers in? Eigen e-mail/wachtwoord, of **SSO** vanuit school (Microsoft/Google/Entra)? Magic links voor leerlingen?

## 4. Privacy / AVG (minderjarigen!)
Leerlingen zijn (deels) minderjarig; dit raakt #1, #18 (opnames), #20 (PDF), chat en AI.
- **4.1** 🔴 Wie is **verwerkingsverantwoordelijke** en wie verwerker (Ondivera/Incluvo vs. school)? Komt er een verwerkersovereenkomst-template?
- **4.2** 🔴 **Ouderlijke toestemming**: voor welke functies is die nodig (account, chat, opnames/transcriptie, AI)? Hoe regelen we dat in de app?
- **4.3** 🟡 Bewaartermijnen: hoe lang bewaren we coachplannen, chats, opnames, transcripties, inzendingen? Mag een opname na transcriptie direct worden verwijderd?
- **4.4** 🔴 #18 transcriptie en #22 AI: mogen leerlinggegevens naar een AI-dienst? Zo ja, **alleen EU-gehost** (digitale soevereiniteit, #2)? Zie ons onderzoek `docs/research/ai-layer.md`.

## 5. Coachplan & formulieren (#8–#22)
- **5.1** 🟡 #8/#9 "vraagtypes die als trigger naar de leeromgeving dienen, komen in elk formulier terug" — kun je de **lijst verplichte vraagtypes/triggers** geven (bv. leervoorkeuren → labels op cursuscontent)?
- **5.2** 🟡 #16 mapping leerling-antwoorden → coach-vragenlijst: je noemt "we hebben een overzicht van welke antwoorden waar gemapt moeten worden". Kun je dat **mapping-overzicht** delen?
- **5.3** 🟡 #19 leervoorkeuren / standaardlabels: wat is de **definitieve lijst** met leervoorkeur-labels (deze labelen ook cursuscontent, #36)?
- **5.4** 🟢 #21 "afgestemd met ouders" is nu een schuifje; ondertekentool is later. Akkoord?
- **5.5** 🟡 #18 transcriptie: opnames van fysiek gesprek én Teams/Zoom. Moeten wij Teams/Zoom-integratie bouwen, of volstaat **bestand uploaden / in-app opnemen**?

## 6. Online cursus (#23–#36, #61)
- **6.1** 🔴 #23 drie cursustypen: **Ondivera-sjabloon → School-template → Uitvoering voor leerling**. Klopt het dat een schooltemplate van een Ondivera-sjabloon "afstamt", en een leerling-uitvoering van een schooltemplate? Wat gebeurt er bij updates van de bron (overerven of loskoppelen)?
- **6.2** 🟡 #24 voortgangsbalk: telt die alleen **aanbevolen/actieve** content of álle content? Coach kan 'm verbergen — per cursus of per leerling?
- **6.3** 🟡 #27 opdracht: antwoordtypes (tekst + bestanden). Max bestandsgrootte/типen? Groepsopdracht: hoe worden groepen samengesteld?
- **6.4** 🟢 #28 beoordelen met tekst/cijfer/spraak-of-videobericht: cijfer optioneel — welke schaal (1–10, vink, rubric)?
- **6.5** 🟢 #33 LTI 1.3 en #34 Ondivera-contentadvies (PortalCMS API) bevestigen als **post-MVP**?

## 7. Chat (#5–#7)
- **7.1** 🟡 1:1 coach–leerling en groepschat/forum binnen een cursus. Moet de coach **altijd kunnen meelezen** in groepschats (#6) — ook melden we dat aan leerlingen i.v.m. transparantie/AVG?
- **7.2** 🟢 Realtime is voldoende met "online" indicatie? Bestanden/afbeeldingen in chat nodig in MVP?

## 8. Takenlijst (#37–#41)
- **8.1** 🟢 Taken komen uit (a) cursusopdrachten en (b) handmatig (coach/leerling). "Vandaag vs. toekomst" o.b.v. deadline. Mag een leerling een eigen taak een deadline geven, of bepaalt de coach dat?
- **8.2** 🟢 #39 takenlijst tijdelijk uitzetten: per leerling, door coach. Akkoord?

## 9. Dashboard coach (#42–#44) & Admin (#60)
- **9.1** 🟡 #42/#43/#44 staan op "exacte dashboard/layout nog bespreken". We maken een eerste versie o.b.v. prototype; kunnen we die met jou/Kimberley aanscherpen?
- **9.2** 🔴 #60 "Admin omgeving voor school en Ondivera" is nog niet uitgewerkt. Welke **beheerfuncties** minimaal? (gebruikers/klanten beheren, formulieren- en cursustemplates, rechten, bewaartermijnen, audit). 

## 10. Notificaties (#3)
- **10.1** 🟢 Alleen **in-app** notificaties in MVP, of ook **e-mail/push**? Voor leerlingen <16 e-mail naar ouder?

---

### Openstaand aan onze kant (geen vraag, ter info)
- We bouwen op een EU/NL-hostbare stack (Bun, Postgres, SolidJS) — voldoet aan #2.
- AI-keuze leggen we vast in `docs/research/ai-layer.md` met EU-data als harde eis.
- Acceptatiecriteria per item werken we uit als testbare checklist in `docs/ROADMAP.md`.
