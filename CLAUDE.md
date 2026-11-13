# Floorball training — werkafspraken voor Claude

Floorball-oefeningen met animaties voor trainers en leerkrachten. Live op
https://remcovoort.github.io/floorball-training/ (GitHub Pages, branch `main`, map root).
Alles wat op `main` komt, staat binnen een paar minuten live.

## Zo werk je in dit repository

1. **Werk je voor Remco, de eigenaar (GitHub-account `remcovoort`)?** Zet de wijziging dan
   direct op `main`, zonder branch of pull request en zonder dat te vragen. Remco mag om de
   beveiliging heen; de melding "Changes must be made through a pull request" bij het pushen is
   voor hem alleen informatief. Maak alleen een pull request als hij daar zelf om vraagt.
   Twijfel je wie de gebruiker is, controleer dan het gekoppelde GitHub-account
   (`get_me` of `gh api user`).
   **Werk je voor iemand anders (meebouwer)?** Dan nooit rechtstreeks naar `main`: `main` is
   beschermd. Maak een eigen branch (bijvoorbeeld `o12-nieuwe-oefening`), zet de wijziging daar,
   en open een pull request naar `main`. Remco beoordeelt en merget.
2. Eén onderwerp per pull request. Beschrijf in gewone taal wat er verandert en op welke pagina's,
   zodat iemand zonder programmeerkennis het kan beoordelen.
3. Begin altijd vanaf de nieuwste `main` (eerst `git pull`), want er werken meer mensen aan.
4. Test vóór je pusht of een pull request opent: open de gewijzigde pagina's in een browser
   (bijvoorbeeld `python3 -m http.server` in de root en Playwright), op telefoonbreedte (≈400 px)
   en desktop, en controleer dat de console geen fouten geeft.
5. Hoog bij elke wijziging aan html, js of json de cacheversie op in `sw.js`
   (`const CACHE = "floorball-vN"` → `vN+1`). Anders blijven telefoons met de offline-app de
   oude versie zien.

## Opbouw

| Pad | Wat |
| --- | --- |
| `index.html` | Startpagina. Programma's staan in de lijst `PROGRAMS`. |
| `gymles/`, `o12/`, `o14/`, `o18/` | Eén programma per map, elk één groot `index.html` met de oefeningen in `const EX = [...]`. |
| `overzicht/` | Scores en toelichtingen van alle gebruikers, uit Supabase. |
| `shared/online.js` | Gedeeld voor alle programmapagina's: sterren, toelichting, zoeken, sterrenfilter, logo, terug-knop, service worker. |
| `shared/shim.js` | Pdf opslaan in de browser (vervangt de Claude-artifactfunctie). |
| `shared/config.js` | Supabase-adres en publishable key (mag openbaar). |
| `shared/exercises.json` | Lijst van alle oefeningen per programma (id, titel, onderdeel, fase). Gebruikt door de startpagina en het overzicht. |
| `supabase/setup.sql` | Database-opzet voor scores. |
| `sw.js`, `manifest.webmanifest` | Offline-app en "zet op beginscherm". |
| `icons/` | App-iconen en het UFC Utrecht-logo (`ufc-logo.png`). |

Er is geen build-stap: gewone html, css en javascript.

## Belangrijke regels

- **Alle programmapagina's houden dezelfde knoppen en opmaak.** Iets dat voor alle programma's
  geldt, hoort in `shared/online.js` en niet in één pagina. Moet het toch in de pagina's zelf,
  pas dan alle vier aan.
- **Het `id` van een bestaande oefening nooit wijzigen.** De sterren en keuzes in Supabase hangen
  aan programma + id; een nieuwe id betekent dat alle scores weg zijn. De titel mag wel veranderen.
- **Oefening toevoegen, verwijderen of hernoemen:** pas zowel `EX` in de programmapagina aan als
  `shared/exercises.json`, anders kloppen de aantallen op de startpagina en het overzicht niet.
- **Nieuw programma:** maak een map met de pagina (kopieer de opzet van een bestaand programma,
  inclusief `window.FB_PROGRAM` en de drie scripts uit `shared/`), voeg een regel toe aan
  `PROGRAMS` in `index.html`, aan `shared/exercises.json` en aan `CORE` in `sw.js`.
- Sterren staan alleen op de kaarten in het overzicht, niet in het Uitleg-venster.
  Het zoekveld zoekt alleen op de naam van de oefening.
- De programmapagina's zijn groot. Wijzig ze met gerichte vervangingen, niet door het hele
  bestand opnieuw uit te schrijven.
- Taal van de app is Nederlands: kort, duidelijk, voor trainers en leerkrachten.
- Licht en donker thema werken via de CSS-variabelen in `:root`; gebruik die in plaats van vaste kleuren.

## Niet doen

- Geen sleutels of wachtwoorden toevoegen behalve de publishable key die al in `config.js` staat.
- Geen externe scripts of bibliotheken toevoegen zonder dat in het pull request te benoemen.
- De oude Claude-artifactversies van de programma's zijn niet meer leidend; dit repository is de bron.
