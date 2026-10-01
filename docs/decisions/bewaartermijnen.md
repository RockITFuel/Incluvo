# Bewaartermijnen

Besluit 01-10-2026 (Youri): **leerlinggegevens worden voorlopig onbeperkt bewaard.**

| Gegevens | Termijn | Waar geregeld |
| --- | --- | --- |
| Coachplannen (alle versies, antwoorden) | onbeperkt | — |
| Chats | onbeperkt | — |
| Transcripties van gesprekken | onbeperkt | — |
| Opnames van gesprekken | niet bewaard: de audio gaat direct naar de transcriptie | `ai.transcribe` |
| Audit-log | `AUDIT_RETENTION_DAYS` (standaard 730 dagen) | `apps/server/src/retention.ts` |

- Er is niets per school in te stellen. Beheer → Instellingen toont het beleid
  alleen-lezen (`admin.settings.getRetention`); de oude stub met
  invulvelden die niets opsloegen is weg.
- Een verzoek om verwijdering (school, ouder, leerling) loopt via Ondivera.
  Er is nog geen functie om een school of leerling definitief te wissen; zie
  `superadmin-beheer.md`.
- Bij een ander besluit (bv. termijn per school): een tabel voor de termijnen,
  een dagelijkse opruimtaak naast `purgeAuditLog`, en het scherm bewerkbaar
  maken. Let op de verwerkersrol (QUESTIONS 4.1): wie bepaalt de termijn, de
  school of Ondivera?
