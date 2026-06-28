# Leerling-voorpagina (landingspagina #4) — feedback Mark Timmermans, 2026-06-12

Bron: gesproken feedback van Mark (Ondivera) bij een doorloop van het
prototype (`demo/page-welkom.jsx`). Audio: WhatsApp 12-06-2026 11:07;
transcript samengevat hieronder. Verwerkt in het prototype op 28-06-2026 en
hier vastgelegd zodat de echte leerling-voorpagina in `apps/web` (#4, nog te
bouwen) deze keuzes overneemt.

## Kernpunt
De voorpagina voelde **te vol** ("er gebeurt heel veel"). Doel: rustiger,
minder blokken — passend bij de doelgroep (8–20 jr, afstandsonderwijs).

## Blok-voor-blok besluit
| Blok | Besluit |
|------|---------|
| **Mood — "Hoe zit je erbij vandaag?"** | Houden. Tekstje eronder: "zullen we beginnen met de **makkelijkste**?" → "met de **eerste**?" (niet impliceren dat taken makkelijk/moeilijk zijn). |
| **Volgende afspraak (coachgesprek)** | Houden — fijn dat de leerling z'n afspraken ziet. |
| **Taken (Vandaag)** | **Versimpelen**: niet de hele takenlijst tonen, maar alleen het aantal ("je hebt 4 taken voor vandaag") + knop "Naar alle taken". Volledige lijst staat op /taken. |
| **Successen** | Houden (mooi), maar **uitschakelbaar** maken. Voor een leerling die weinig succes ervaart of het lastig heeft kan een successenlijst confronterend zijn. (sluit aan bij #39-achtige "uitzetbaar" logica; ook in mood-blok al voorzien.) |
| **Sociaal (chats)** | Houden **op de voorpagina** — leerling ziet meteen of medeleerling/coach een bericht stuurde. |
| **Snelkoppelingen** | **Weg** — rustiger houden. |
| **Aanbevolen voor jou** | **Weg** van de voorpagina — rustiger houden. (Aanbevolen content blijft bestaan binnen Cursussen, #35/#36.) |

## Overige (geen wijziging, ter bevestiging door Mark)
- **Mijn taken**-pagina: duidelijk, netjes onder elkaar — geen feedback.
- **Cursussen**: geen feedback voor nu.
- **Coachplan ("het plan")**: goed zoals het staat. Bevestigt twee eisen:
  school moet **eigen vragen kunnen toevoegen/aanpassen** (#8/#9), en de
  leerling moet een vraag kunnen **overslaan** of **met de coach bespreken**
  (#11–#14). Allen al voorzien in de backlog.
- **Chat**: herkenbaar (WhatsApp-achtig), makkelijk in gebruik = goed.
  Mark waardeert expliciet dat zichtbaar is dat **de coach kan meelezen** in
  een projectchat (#6 supervisie/transparantie).

## Implicatie voor de echte build (#4)
Wanneer de leerling-voorpagina in `apps/web` wordt gebouwd: bovenstaande
indeling aanhouden (mood, volgende afspraak, taken-samenvatting, optionele
successen, sociaal). De "successen uit/aan"-voorkeur hoort op termijn als
instelling per leerling te persisteren (vgl. de per-leerling toggles op
`coach_assignment`, zie `docs/decisions/data-model.md`).
