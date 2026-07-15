# Verbeteranalyse — juli 2026

Een analyse van hoe de bouwproject-app naar een hoger niveau kan, gebaseerd op een volledige doorlichting van de codebase én online research naar vergelijkbare apps (Planner 5D, magicplan, Sweet Home 3D, Cedreo, HomeZada, e.a.), performance-best-practices (Konva, react-three-fiber, PWA/Serwist) en actuele Nederlandse bouwregelgeving (Bbl).

**Samenvatting.** De app heeft in korte tijd een indrukwekkende feature-diepte opgebouwd (CAD-editing, daken, 3D, doorsnedes, werkbladen). De grootste winst zit nu niet in méér features, maar in vier dingen: (1) een acute dataverlies-bug in de backup repareren, (2) een fundament van tests en CI leggen onder alle rekenlogica, (3) de offline/PWA-belofte echt waarmaken, en (4) daarna gericht de features bouwen die deze app onderscheiden van commerciële alternatieven: **maatvaste PDF/DXF-export voor aannemer en vergunning**.

---

## 🔴 1. Urgent: dataveiligheid

Alle projectdata leeft uitsluitend in IndexedDB op één apparaat. Dat maakt de backup-functie de enige verdedigingslinie tegen dataverlies — en die is nu kapot én kwetsbaar.

### 1.1 Backup-export mist zes tabellen (dataverlies-bug)

- **Probleem:** `TABLES` in `src/app/instellingen/page.tsx` (regel 13–17) bevat 15 tabellen, maar de database (`src/lib/db/db.ts`) heeft er 21. De tabellen `stairs`, `columns`, `beams`, `roofs`, `dormers` en `sections` (toegevoegd in DB-versies 3–5) gaan **niet** mee in de JSON-backup. Wie nu een backup terugzet, verliest alle trappen, kolommen, stalen balken, daken, dakkapellen en doorsnedelijnen.
- **Aanbeveling:** leid de tabellenlijst af uit de database zelf (`db.tables.map(t => t.name)`) in plaats van een hardcoded lijst, zodat toekomstige migraties nooit meer vergeten kunnen worden. Voeg een versieveld-check toe bij import.
- **Moeite:** klein (< 1 uur).

### 1.2 Blob-serialisatie muteert live databaserijen

- **Probleem:** bij export worden Blob-velden in-place vervangen (`row[f] = { __blob: ... }`, regel 77) op de objecten die uit Dexie komen. Dat is fragiel: een fout halverwege laat gemuteerde objecten achter en het patroon nodigt uit tot bugs.
- **Aanbeveling:** serialiseer naar een kopie (`structuredClone` of spread) in plaats van het origineel te muteren.
- **Moeite:** klein.

### 1.3 IndexedDB kan door de browser worden gewist

- **Probleem:** browsers mogen IndexedDB-opslag onder druk (storage pressure) verwijderen. Voor een app waar maanden ontwerpwerk in zit, is dat onacceptabel risico.
- **Aanbeveling:** vraag persistente opslag aan in `src/components/Bootstrap.tsx` via `navigator.storage.persist()` en toon de status in Instellingen. Overweeg daarnaast een automatische periodieke backup-reminder (bijv. "laatste backup 14 dagen geleden") op het dashboard.
- **Moeite:** klein.

---

## 🟠 2. Fundament: tests, CI en foutafhandeling

De git-historie laat een hoog feature-tempo zien, maar er is **geen enkele test en geen CI**. Juist deze app zit vol pure, uitstekend testbare rekenlogica waar fouten direct doorwerken in werktekeningen en kostenramingen.

### 2.1 Unit-tests voor de rekenkern

- **Probleem:** `src/lib/geometry.ts`, `validation.ts`, `phases.ts`, `quantityTakeoff.ts`, `roofGeometry.ts`, `openingSchedule.ts`, `roomDivider.ts` en `sunPosition.ts` zijn allemaal pure modules zonder tests. Een regressie in bijv. de m²-berekening of de faseringsblokkade valt nu pas op in de UI — of helemaal niet.
- **Aanbeveling:** voeg **Vitest** toe (sluit naadloos aan op TypeScript + ESM) en schrijf eerst tests voor de modules met de meeste domeinkennis: `validation.ts` (NEN/Bbl-regels), `phases.ts` (afhankelijkheden/blokkades), `quantityTakeoff.ts` en `geometry.ts`. Doel: de kern gedekt, niet 100% coverage.
- **Moeite:** middel (setup klein, tests schrijven is doorlopend werk).

### 2.2 CI-pipeline

- **Probleem:** geen `.github/workflows/` — niets bewaakt dat `lint` en `build` groen blijven bij elke PR.
- **Aanbeveling:** één GitHub Actions-workflow: `npm ci && npm run lint && tsc --noEmit && vitest run && npm run build` op elke PR.
- **Moeite:** klein.

### 2.3 Route-level error- en loading-boundaries

- **Probleem:** `src/app/` heeft geen enkele `error.tsx`, `global-error.tsx`, `loading.tsx` of `not-found.tsx`. Een runtime-fout in bijv. de 3D-view geeft een witte pagina.
- **Aanbeveling:** voeg minimaal een globale `error.tsx` (met "herlaad"-knop en backup-hint) en `not-found.tsx` toe; `loading.tsx` voor de zware routes (`/3d`, `/plattegrond`).
- **Moeite:** klein.

### 2.4 `alert()`/`confirm()` vervangen door eigen UI

- **Probleem:** Instellingen gebruikt `alert()` en `confirm()` voor import/reset. Dat oogt niet als een volwassen app en werkt slecht in een geïnstalleerde PWA.
- **Aanbeveling:** één klein toast-/dialoogcomponent (geen extra dependency nodig) en overal hergebruiken.
- **Moeite:** klein–middel.

### 2.5 README invullen

- **Probleem:** `README.md` is een placeholder. Voor een project van deze omvang hoort er minimaal een beschrijving, screenshots, dev-instructies en de PLAN.md-link te staan.
- **Moeite:** klein.

---

## 🟡 3. Performance & PWA

### 3.1 Serwist echt aansluiten (of verwijderen)

- **Probleem:** `@serwist/next` en `serwist` staan in `package.json` maar worden nergens gebruikt: `next.config.ts` is leeg en er draait een handgeschreven `public/sw.js` die alleen `/` en `/plattegrond` pre-cachet. Routes als `/3d`, `/kosten`, `/fases`, `/werkblad` en `/aanzichten` zijn dus **niet gegarandeerd offline beschikbaar** bij eerste bezoek — terwijl offline-first juist het bestaansrecht van de app is (gebruik op de bouwplaats).
- **Aanbeveling:** wire Serwist in `next.config.ts` + `src/app/sw.ts`, zodat de volledige app-shell en alle routes automatisch geprecached worden bij elke build. Verwijder daarna `public/sw.js` en pas `src/components/RegisterSW.tsx` aan. Serwist is de actief onderhouden opvolger van next-pwa, gebouwd voor de App Router. Zet `reloadOnOnline: false` zodat een verbindingsherstel geen onopgeslagen editor-state wegblaast.
- **Moeite:** middel.

### 3.2 Konva-optimalisaties in de 2D-editor

De editor (`src/components/editor2d/`, 23 layer-componenten) blijft soepel bij kleine plattegronden, maar de officiële Konva-performance-richtlijnen bieden ruimte voor groei:

- Zet `listening={false}` op puur decoratieve layers (grid, maatvoering, faseringsoverlay) — standaard registreert élke shape hit-detection, wat bij honderden shapes merkbaar tikt.
- Houd het aantal `<Layer>`-elementen minimaal (elke layer is een eigen canvas); combineer statische layers.
- Cache complexe statische shapes (bijv. meubelsymbolen uit `furnitureSymbols.tsx`) met `cache()`.
- Verberg shapes buiten het zichtbare viewport bij grote plannen.
- **Moeite:** middel; meetbaar met de browser-profiler vóór/na.

### 3.3 react-three-fiber-optimalisaties in de 3D-view

`src/components/scene3d/Scene3D.tsx` rendert continu (default frameloop), ook als er niets beweegt:

- **`frameloop="demand"`** op de `<Canvas>`: alleen renderen bij wijzigingen/camerabeweging. Grootste winst voor batterij en warmte op tablet/telefoon — het primaire gebruiksscenario op de bouwplaats.
- **Instancing** (drei `<Instances>`/`<Merged>`) voor herhaalde geometrie (kozijnen, meubels, kolommen): duizenden objecten in één draw call in plaats van één per mesh.
- Dispose geometrieën/materialen bij unmount en houd het aantal unieke materialen laag.
- **Moeite:** middel.

### 3.4 Dexie-queries via indexen

- **Probleem:** enkele hooks in `src/lib/hooks.ts` doen `toArray()` en filteren daarna in JS (o.a. openings, dormers), terwijl de indexen (`wallId`, `roofId`, `levelId`) er al zijn.
- **Aanbeveling:** gebruik `.where('wallId').anyOf(...)`-queries. Bij de huidige schaal onmerkbaar, maar het voorkomt een sluipende vertraging naarmate het plan groeit.
- **Moeite:** klein.

### 3.5 PWA-installatie-details

- Voeg gerasterde PNG-iconen (192/512, incl. maskable) toe naast de SVG in `src/app/manifest.ts` — sommige platforms/installers negeren SVG-only manifests.
- Overweeg een `apple-touch-icon` en splash-screens voor iOS-installatie.
- **Moeite:** klein.

---

## 🟢 4. Features die het niveau verhogen

Gebenchmarkt tegen commerciële apps. De rode draad uit de research: tools die zowel *ontwerpen* als *communiceren met de bouwpraktijk* winnen. Deze app heeft al een unieke combinatie (digital twin + fasering + kosten); de onderstaande features maken die combinatie af. Gesorteerd op waarde/moeite.

### 4.1 Maatvaste PDF-export (vergunnings-/aannemerstekeningen) — grootste onderscheider

- **Wat:** het werkblad (`/werkblad`) en de plattegrond exporteren als **PDF op ware schaal** (1:50/1:100, papierformaat A4/A3, titelblok met revisie en noordpijl). Nu is er alleen PNG-export (`src/lib/exportImage.ts`).
- **Waarom:** dit is precies wat tools als Plan7Architect, Cedreo en TinyFloorPlan als kernwaarde verkopen: tekeningen die je direct naar een aannemer of het omgevingsloket kunt sturen. De app heeft de schaal- en revisie-infrastructuur al (werkblad kent schaal + revisies) — de stap naar print-op-schaal PDF is relatief klein.
- **Hoe:** vector-PDF genereren client-side (bijv. `pdf-lib` of `jspdf`, beide offline-vriendelijk); de bestaande maatvoeringslogica van aanzichten/werkblad hergebruiken.
- **Moeite:** middel.

### 4.2 DXF-export voor overdracht naar CAD/architect

- **Wat:** wanden, openingen en maatvoering als DXF exporteren zodat een architect of constructeur in AutoCAD e.d. verder kan.
- **Waarom:** Space Designer 3D, Cedreo en TinyFloorPlan positioneren DXF-export expliciet als de brug naar professionals — relevant zodra een constructeur naar de stalen balken en dragende wanden moet kijken.
- **Hoe:** DXF is tekst-gebaseerd; een minimale writer voor LINE/LWPOLYLINE/TEXT-entiteiten op basis van `src/lib/domain/types.ts`-coördinaten (alles is al in meters) is goed te doen, eventueel met een kleine library.
- **Moeite:** middel.

### 4.3 Validatieregels bijwerken van Bouwbesluit 2012 naar Bbl

- **Wat:** `src/lib/validation.ts` verwijst naar Bouwbesluit 2012, maar sinds 1 januari 2024 geldt het **Besluit bouwwerken leefomgeving (Bbl)** onder de Omgevingswet. Het Bbl kent aparte hoofdstukken per situatie (nieuwbouw / bestaande bouw / **verbouw**) — precies het onderscheid dat deze renovatie-app nodig heeft — en o.a. aangescherpte kabeleisen bij verbouw.
- **Aanbeveling:** hernoem de regelverwijzingen, en maak per regel expliciet of het verbouwniveau of nieuwbouwniveau geldt. Dat maakt de meldingen ook praktisch bruikbaarder ("mag bij verbouw" vs. "moet bij nieuwbouw").
- **Moeite:** middel (vooral uitzoekwerk, weinig code).

### 4.4 Voortgangsfoto's per taak/fase

- **Wat:** foto's koppelen aan taken en fases, met een vóór/na-tijdlijn per ruimte. De `photos`-tabel bestaat al in het datamodel.
- **Waarom:** in de research over renovatie-apps voor huiseigenaren (HomeZada, Remodelum) komt fotodocumentatie per bouwfase steevast terug als een van de meest gewaardeerde features — en het versterkt het digital-twin-idee: vastleggen wat er ín de gesloten wand zit (leidingwerk!) vóórdat die dichtgaat, gekoppeld aan de faseringsengine die daar al op stuurt.
- **Moeite:** middel.

### 4.5 Budget-vs-realisatie-signalering per fase

- **Wat:** per fase begroot vs. uitgegeven tonen, met afwijkingssignalering en een eenvoudige eindprognose (uitputting × resterende fases). Budget-, expense- en fasedata zijn er al (`/kosten`, `/fases`).
- **Waarom:** apps als Remodelum en HomeZada maken "realtime zicht op overschrijding" hun kernbelofte; deze app heeft de data al maar toont nog geen afwijkingen.
- **Moeite:** klein–middel.

### 4.6 Multi-project-ondersteuning

- **Wat:** projectkeuze/-aanmaak in plaats van "pak het eerste project" (`useProject()` in `src/lib/hooks.ts`, `ensureSeed()` in `src/lib/db/seed.ts`).
- **Waarom:** het hele datamodel draagt al `projectId`; alleen de UI ontbreekt. Handig voor bijvoorbeeld schuur/bijgebouw als apart project of experimentele varianten.
- **Moeite:** middel.

### 4.7 Cloud-sync / multi-device (groter toekomsttraject)

- **Wat:** last-write-wins-synchronisatie naar een lichte backend, zodat plannen op telefoon (bouwplaats) en desktop (ontwerpen) beide werken.
- **Waarom:** het datamodel is hier expliciet op voorbereid (`updatedAt` + `deleted` op elke entiteit, zie commentaar in `src/lib/db/db.ts`). Het gangbare offline-first-patroon is: UI → IndexedDB (optimistisch) → sync-queue → achtergrond-sync → reconciliatie.
- **Kanttekening:** dit introduceert een backend, auth en hosting — pas starten als 🔴/🟠 op orde is en de backup-strategie robuust is.
- **Moeite:** groot.

### 4.8 AI-richtingen (verkennend)

- **Wat:** de 2026-trend in woningontwerp-apps is duidelijk: foto/schets-naar-plattegrond, AI-layoutsuggesties en fotorealistische renders (Planner 5D, Homestyler, e.a.).
- **Aansluiting:** de app heeft al een `layoutGenerator.ts` — AI-gestuurde indelingsvarianten ("genereer 3 indelingen voor deze verdieping binnen deze dragende structuur") zou daar een natuurlijk vervolg op zijn. Foto-naar-plattegrond is voor een bestaande boerderij vooral nuttig als startpunt-import.
- **Kanttekening:** vrijwel alle AI-features vereisen een online API en botsen dus met offline-first; positioneren als optionele online extra's.
- **Moeite:** groot.

---

## 🔵 5. Onderhoudbaarheid

- **Grote componenten opsplitsen:** `src/components/scene3d/Scene3D.tsx` (1699 regels), `src/components/editor2d/PlanEditor.tsx` (1531) en `SelectionPanel.tsx` (1137) zijn de plekken waar nieuwe features nu het duurst zijn. Splits per verantwoordelijkheid (bijv. Scene3D → walls/roof/furniture/controls-submodules; SelectionPanel → paneel per entiteitstype). Doe dit incrementeel, mét de tests uit §2 als vangnet.
- **`phaseOverlay` persist:** de zustand-`partialize` in `src/lib/store/editor.ts` slaat `phaseOverlay` niet op; na een herlaad is die instelling weg. Kleine fix.
- **Dode dependencies opruimen:** als voor Serwist gekozen wordt (§3.1) vervalt `public/sw.js`; zo niet, verwijder dan de serwist-packages.

---

## Voorgestelde roadmap

| Sprint | Focus | Inhoud |
|---|---|---|
| 1 — Dataveiligheid & fundament | 🔴 + 🟠 | Backup-fix (§1.1–1.2), `storage.persist()` (§1.3), Vitest + eerste tests voor validation/phases/geometry (§2.1), CI (§2.2), error boundaries (§2.3), README (§2.5) |
| 2 — Offline & performance | 🟡 | Serwist-integratie (§3.1), `frameloop="demand"` + instancing (§3.3), Konva `listening(false)` (§3.2), PNG-iconen (§3.5), toasts (§2.4) |
| 3 — Onderscheidende features | 🟢 | PDF-export op schaal (§4.1), budget-signalering (§4.5), foto's per fase (§4.4), Bbl-update (§4.3); daarna DXF (§4.2) en multi-project (§4.6) |

Cloud-sync (§4.7) en AI (§4.8) zijn bewuste vervolgtrajecten ná deze drie sprints.

---

## Bronnen

**Vergelijkbare apps / feature-benchmark**
- [Sweet Home 3D vs Planner 5D vergelijking](https://www.sweethome3d.com/blog/sweet-home-3d-vs-planner5d-comparison/)
- [magicplan (Google Play)](https://play.google.com/store/apps/details?id=com.sensopia.magicplan&hl=en_US)
- [Top free floor plan creator apps (Homestyler)](https://www.homestyler.com/article/floorplanner/top-free-floor-plan-creator-apps)
- [HomeZada — home improvement planner & budgeting](https://www.homezada.com/homeowners/home-improvement)
- [Remodelum — renovation budget tracker](https://www.remodelum.com/renovation-expense-budget-tracker)
- [Re:Build — renovation planner (Google Play)](https://play.google.com/store/apps/details?id=com.mtv.rebuild)

**Export voor vergunning/aannemer**
- [Plan7Architect — construction drawings for permit](https://plan7architect.com/create-construction-drawings-for-permit-with-plan7architect-ai3/)
- [Space Designer 3D — multi-format export (DXF, IFC, glTF, PDF)](https://www.spacedesigner3d.com/features/multi-format-export)
- [TinyFloorPlan — export formats (PNG, PDF, DXF, SVG)](https://tinyfloorplan.com/exports)
- [Cedreo — floor plan creator met DXF-handoff](https://cedreo.com/floor-plans/floor-plan-creator/)

**Performance**
- [Konva — alle performance-tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [Konva — shape caching](https://konvajs.org/docs/performance/Shape_Caching.html)
- [React Three Fiber — scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Three.js instancing (Codrops)](https://tympanus.net/codrops/2025/07/10/three-js-instances-rendering-multiple-objects-simultaneously/)

**PWA / offline**
- [Next.js 16 PWA met echte offline-support (LogRocket)](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)
- [Offline apps met Next.js en Serwist (DEV)](https://dev.to/sukechris/building-offline-apps-with-nextjs-and-serwist-2cbj)
- [Offline-first PWA met Next.js & IndexedDB](https://www.wellally.tech/blog/build-offline-first-pwa-nextjs-indexeddb)

**Regelgeving**
- [Bbl vervangt Bouwbesluit 2012 (VDS)](https://vds-nederland.nl/brandwiki/besluit-bouwwerken-leefomgeving/)
- [Van Bouwbesluit 2012 naar Bbl (Obex)](https://obex.nl/bouwbesluit-2012-naar-bbl/)
- [Omgevingsloket — Bouwbesluit 2012 en Bbl](https://omgevingswet.overheid.nl/helpcentrum/aanvragen-melden/bouwbesluit-2012-besluit-bouwwerken)

**AI-trends**
- [Wat doet AI home design software in 2026 (Maket)](https://www.maket.ai/blog/what-does-ai-home-design-software-actually-do)
- [Homestyler — AI floor plan generator](https://www.homestyler.com/article/trends/the-best-free-ai-floor-plan-generator-in)
- [Planner 5D — AI floor plan generator](https://planner5d.com/use/ai-floor-plan-generator)
