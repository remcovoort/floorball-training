# Floorball training

Floorball-oefeningen met animaties voor trainers en leerkrachten. Kies een programma, stel een training samen, print hem als pdf en geef oefeningen een score van 1 tot 5 sterren.

Open de app: **https://remcovoort.github.io/floorball-training/**

## Programma's

| Map | Programma |
| --- | --- |
| `o18/` | O18, 16–18 jaar |
| `gymles/` | O10, 6–10 jaar (map en interne naam blijven `gymles`) |
| `o14/`, `o12/` | komen later |

Een nieuw programma toevoegen: maak een map met de pagina en zet een regel bij `PROGRAMS` in `index.html`.

## Scores en statistieken

- Sterren en keuzes gaan naar Supabase. De instellingen staan in `shared/config.js`.
- De database maak je aan met `supabase/setup.sql` (SQL Editor in Supabase).
- Het overzicht met per oefening de gemiddelde score, het aantal stemmen en hoe vaak hij is gekozen staat op `overzicht/`.
- Elk apparaat telt één keer per oefening. Opnieuw scoren vervangt de oude score.

## Overig

- `shared/online.js`: sterren, keuzes tellen, link naar het startscherm.
- `shared/shim.js`: pdf opslaan in de browser.
- `sw.js` en `manifest.webmanifest`: de app werkt offline en kan op het beginscherm.
- Bewaarde trainingen staan in de browser van de gebruiker, niet online.

## Meebouwen

Wijzigingen gaan via een pull request naar `main`; `main` zelf is beschermd. De werkafspraken (ook voor Claude) staan in `CLAUDE.md`.
