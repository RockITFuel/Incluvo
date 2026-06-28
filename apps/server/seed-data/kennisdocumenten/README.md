# Kennisdocumenten (RAG-bronnen, #20/#22)

Bronteksten voor de AI-advies RAG-laag. De ingestie (`seed:kennis`) leest de
`*.txt` bestanden hier samen met `manifest.json`.

> De `*.txt` bestanden zijn **niet** in git opgenomen (`.gitignore`): het is
> auteursrechtelijk beschermd materiaal van derden (o.a. een gepubliceerd
> UDL-artikel en een manuscript). Alleen `manifest.json` is getrackt.

## Bestanden (genereren vóór `seed:kennis`)

| file | bron (Mark, e-mail "Input Incluvo" 12-06-2026) |
|------|-----------------------------------------------|
| `2a-udl-strategies.txt` | "2a. Reducing-Accommodation-Requests…Practical-UDL-Strategies.pdf" |
| `2b-doelgroep-thuiszitters.txt` | "2b. doelgroep_thuiszitters_doelgroepanalyse_final.docx" |
| `2c-digitale-school-manuscript.txt` | "2c. Manuscript De kracht van een digitale school 2023.docx" |

## Regenereren

Haal de drie bijlagen uit de mailbox en extraheer platte tekst:

- **PDF** → `pypdf` (`uvx --with pypdf python3 …`) of `pdftotext`.
- **DOCX** → unzip `word/document.xml`, vervang `</w:p>` door newline, strip
  XML-tags, `html.unescape`, blanco regels inklappen.

Schrijf de platte tekst naar de bestandsnamen hierboven en draai daarna:

```sh
bun run --cwd apps/server seed:kennis
```

`manifest.json` koppelt elk bestand aan titel, oorspronkelijke bestandsnaam en
type (pdf/docx) en bepaalt wat er als `kennisdocument` wordt ingeladen.
