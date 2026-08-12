# Verbeterplan Bouwproject — UX, inkoopmeters, kabeltrekplan & constructie

## Context

De app (Next.js 16 + react-konva + zustand + Dexie, offline-first PWA, digital twin voor de boerderijrenovatie) staat functioneel al ver, maar drie verkenningen over de hele codebase bevestigen het gevoel van de gebruiker:

1. **UX is de grootste rem.** Bijna niets is versleepbaar (alleen meubels en muureindpunten — stopcontacten, sanitair, deuren, balken alléén via pijltjestoetsen, dus onbruikbaar op tablet). Undo/redo registreert alleen create/delete: een verplaatsing terugdraaien kan niet, en Ctrl+Z maakt dan stilletjes iets ouders ongedaan. Muisdrag is omgekeerd (leeg canvas = lasso i.p.v. pannen), contextmenu is rechtsklik-only, de toolbar clipt op telefoons, en de Enter-om-leiding-op-te-slaan-knop is kapot (stale closure, `PlanEditor.tsx:257-268`).
2. **Van tekening naar inkooplijst ontbreekt de kern.** Er zijn twéé tegenstrijdige rekenengines (`quantityTakeoff.ts` vs `Materiaal.estimateFromPlan`), en **nergens** worden kabel-, leiding- of kanaalmeters berekend. Leidingdiameter is hardcoded, elektragroep is een vrij tekstveld, het kabelpad-veld (`ElectricalItem.path`) is dode code. BOM-sync is naam-gebaseerd en niet idempotent.
3. **Constructie-intelligentie is nul.** Eén `loadBearing`-boolean en een waarschuwingstekst. Geen latei-entiteit, geen overspanningstabellen, geen balkadvies.

Doel: één samenhangend, gefaseerd plan dat (a) de editor intuïtief maakt, (b) van elk getekend plan een echte inkooplijst in meters/stuks maakt, (c) een kabeltrekplan per groep oplevert, en (d) indicatief balken/latei-advies geeft.

## Leidende principes

- **PR-formaat:** elk genummerd item = één afgebakende PR (½–2 dagen). Fundament eerst (mutatielaag, takeoff-engine), daarna features die erop bouwen.
- **PlanEditor.tsx (1531 regels) niet big-bang herschrijven** — extraheren langs bestaande naden, één hook per PR, identiek gedrag als acceptatiecriterium.
- **Elke berekening = pure functie + vitest-test** (patroon van `geometry.ts`/`phases.ts` doortrekken).
- **Dexie-migraties additief**: v6 (materials sourceId-index), v7 (circuits-tabel), v8 (plumbing startZ/endZ-upgrade). Vóór v6: JSON-export/backupknop in Instellingen als vangnet (solo-gebruiker met echte data).
- **Alle CRUD loopt al door `src/lib/db/repo.ts`** — undo/redo-fix kan dus centraal, niet op 15 losse plekken.

---

## Fase 0 — Testinfra + quick wins (2 PR's)

**PR 0.1 — Vitest**: `vitest` + `fake-indexeddb`, karakterisatietests voor `geometry.ts`, `quantityTakeoff.ts` (huidig gedrag vastleggen als vangnet), `phases.ts`, `openingSchedule.ts`.

**PR 0.2 — Quick wins** (klein, direct voelbaar):
1. Fix Enter-opslaan-bug pijptool (stale `pipePoints`, deps `PlanEditor.tsx:307-308`) via functionele setter/ref.
2. Pan/lasso omdraaien: leeg-canvas-drag = **pannen**; lasso via expliciete knop + Shift+drag.
3. Toolbar responsive (`overflow-x-auto`, geen clipping op 390px).
4. Snap-toggle in store + Alt = tijdelijk snap uit; grid-zichtbaarheid ontkoppeld van snapping.
5. Nep-resize-hoekpunten op meubels weg (echte handles komen in A5).
6. HUD-botsingen: helperbalken naar `top-14`; dubbele LevelSwitcher/TopBar-tabs dedupliceren; ElectricalLegend wegklikbaar.
7. Werkblad toevoegen aan BottomNav (`BottomNav.tsx:9-16`).

## Fase 1 — Workstream A: Editor-UX-fundament (6 PR's)

**PR A1 — Mutatielaag + volledig undo/redo** (⚠ riskantste PR; eerst tests uit 0.1):
- `history.ts`: update-actie krijgt `before` **én `after`** (fixt redo-no-op `history.ts:76-79`); nieuwe `batch`-actie voor multi-select-operaties als één undo-stap.
- Nieuw `src/lib/db/mutate.ts` bovenop `repo.ts`: `mCreate`/`mUpdate` (leest before uit DB)/`mRemove`/`mBatch` — pushen automatisch naar history. Alle call-sites in PlanEditor, SelectionPanel, WallsLayer, FurnitureLayer, use3DEdit migreren (grep-checklist).
- Drag-conventie: snapshot bij dragstart, Konva-only tijdens drag, één `mUpdate` bij dragend.
- Tests: create/update/remove/batch, undo-na-move-undoet-niet-de-create.

**PR A2 — Universele drag voor álle entiteiten**:
- Hook `useEntityDrag.ts` (snap, locked-layers, history, live maatlabel); toepassen op elektra, sanitair, hvac, trappen, kolommen, balken (incl. eindpunt-handles), secties, ruimtes, hele muren.
- **Openingen langs de muur slepen** via `projectOnSegment` (geometry.ts:68) → muteert `offset`, geklemd; loslaten bij andere muur = re-home; buiten bereik = terugveren + toast.

**PR A3 — Touch-pariteit + contextmenu**: long-press (500ms) = contextmenu; touch-multiselect ("Selecteer meer"-modus); "Bewerken" in menu echt laten werken (opent SelectionPanel; is nu no-op `PlanEditor.tsx:1515-1520`).

**PR A4 — Tekenfeedback + bewerkbare paden**: live maatvoering bij álle tekentools (pijplengte, ruimte-oppervlak, balklengte — nu alleen muren); `PathEditOverlay.tsx` met vertex-handles/insert/delete voor pijpen (en later kabels); toasts i.p.v. stille failures.

**PR A5 — Meubelresize + viewport**: echte resize-handles (schrijven bestaande `width`/`depth`-velden); zoomknoppen + fit-to-content; viewport persistent per verdieping.

**PR A6 — Lege staat + help + afronding extractie**: empty-state-kaart in lege editor; sneltoets-overlay op `?`; PlanEditor eindigt als orkestrator ≤ ~700 regels (`useEditorKeyboard`, `usePointerGestures`, `useEntityDrag`, `EditorContextMenu`, `EditorHud` geëxtraheerd).

## Fase 2 — Workstream B: Eén takeoff-engine (3 PR's)

**PR B1 — Engine + catalogus (puur)**: nieuw `src/lib/takeoff/` met `catalog.ts` (artikelen: key, eenheid, **pakgrootte**, **verliesfactor**, indicatieve prijs, categorie), `recipes.ts` (metalstud/massief per `WallMaterial`, dekvloer, vloerafwerking, plinten, schilderwerk — verenigt het goede uit beide oude engines: openingaftrek uit `computeQuantities` + plaatrekenwerk uit `estimateFromPlan`), `engine.ts` → `TakeoffLine{sourceId, netQty, grossQty, packs, buyQty, prijs, levelId, phaseOrder}`. Handnarekenbare tests.

**PR B2 — Idempotente BOM-sync (Dexie v6)**: `MaterialItem` + `sourceId/articleKey/packSize/supplier`; `syncTakeoffToBom`: match op sourceId, `needed` → bijwerken, `ordered/delivered` → nooit muteren (delta-regel bij afwijking), verdwenen → soft-delete. Test: 2× draaien = 0 wijzigingen.

**PR B3 — UI-omschakeling**: Hoeveelheden rendert engine (level-tabs, netto/bruto/pakken/prijs, sync-knop); `estimateFromPlan` verwijderen; werkblad-Specificaties op engine; daarna `quantityTakeoff.ts` weg.

## Fase 3 — Workstream C: Groepen, kabelroutering, trekplan (4 PR's)

**PR C1 — Groepenmodel (Dexie v7)**: nieuwe entiteit `ElectricalCircuit{number, name, breaker, cableSpec, aardlekcluster, kleur, panelId}`; `ElectricalItem.circuitId`; upgrade migreert bestaande `group`-strings naar circuits. UI: "Groepenkast"-paneel (CRUD, toewijsmodus door items aan te tikken, kleuroverlay per groep); SelectionPanel: tekstveld → circuit-select. Validatie op circuits (>12 punten, perilex, geen paneel).

**PR C2 — Routeringsalgoritme (puur)**: `src/lib/routing/cableRouting.ts` — **Dijkstra over het muurskelet** (knopen = muureindpunten + voetpunten van items/paneel; realistisch én deterministisch, i.t.t. vrij Manhattan-grid). Kabel per groep als ketting vanaf paneel; lengte = horizontaal pad op plafond-/vloerhoogte **+ verticale stijgleidingen** (`|heightZ − routehoogte|`) **+ 2m paneelstaart + 0,3m slack per punt, ×1,10**. Multi-level via stijgroute. Handmatige override via het (nu dode) `ElectricalItem.path`-veld, bewerkbaar met PathEditOverlay. Handberekende tests.

**PR C3 — Overlay + trekplan op werkblad**: `CableRoutesLayer` (gestippelde routes in groepskleur, per groep aan/uit, lengtelabels); nieuw werkblad-tabblad **"Elektra"**: plattegrond met routes + **trekkabellijst** ("Groep 3 — Keuken — B16 — 3×2,5 mm² — 28 m — 9 dozen"); stijgleidingen op wandaanzichten.

**PR C4 — Kabel → takeoff**: recipe elektra (VD-draad per 100m-rol, flexbuis ×1,05, inbouw-/centraaldozen, afdekramen) in de engine.

## Fase 4 — Workstream D: Water & HVAC afmaken (3 PR's)

**PR D1 — Leidingspecs + afschot (Dexie v8)**: `PIPE_SPECS`-constantentabel (water 15/22, afvoer 40/50/75/110 met min. 5mm/m afschot, cv 15/22); hardcoded `drain?50:22` weg; diameter-select + `startZ/endZ` + live afschotweergave in SelectionPanel; afschot-validatieregel.

**PR D2 — HVAC-padtool + vloerverwarming**: pijptool generaliseren naar `pathDraw{domain, type}` (plumbing/hvac/kabel-override); vloerverwarmingsschatting per ruimte = NVO ÷ h.o.h. (0,10/0,15/0,20m, default 0,15 ≈ 6,7 m/m²) + aansluitlengte.

**PR D3 — Leidingmeters → takeoff**: som padlengtes per type × diameter (+ verticaal), ×1,05, fittinghint uit knikken; SelectionPanel toont echte lengte i.p.v. puntentelling; leidingstaat op werkblad.

## Fase 5 — Workstream E: Constructiemodule (3 PR's)

**PR E1 — Rekentabellen (puur)**: `src/lib/structural/` met `sections.ts` (HEA/HEB/IPE + houten balken + lateien, mét Wy/Iy/gewicht — vervangt `BEAM_PROFILE_DIMS`), `loads.ts` (NL-presets: vloer 1,75 kN/m² variabel + permanent, dak, muurgewicht per materiaal → lijnlast-helper), `sizing.ts` (`M=qL²/8` → benodigde Wy; doorbuiging `5qL⁴/384EI ≤ L/250` → benodigde Iy; top-3 profielen + benuttingsgraad). **Elke output draagt onontkoombaar "Indicatief — laat toetsen door een constructeur".** Tests tegen handberekening.

**PR E2 — Lateien + suggesties in editor**: `Opening.lintel{material, profile, lengthM, bearingM}` (opleg 0,15m per zijde); validatieregel "opening in dragende muur zonder latei"; SelectionPanel-knop "Stel voor" (3 radioknoppen "wat draagt deze muur?" → lijnlast → profielkeuze); zelfde flow voor geselecteerde `Beam`; sloopflow dragende muur → "Vervangende balk voorstellen" maakt Beam op muurlijn aan.

**PR E3 — Constructie → takeoff + werkblad**: staal-/houtmeters + gewicht in de engine; balken/kolommen/trappen op `WerkbladPlan` (ontbreken nu); "Constructiestaat"-tabel + disclaimer in titelblok; latei-kolom in kozijnstaat.

## Fase 6 — Workstream F: Dwarsdoorsnijdend (4 PR's, deels parallel vanaf fase 2)

**PR F1 — Validatie-upgrade**: issues klikbaar (`entityId` → select + zoom), alle verdiepingen i.p.v. alleen actieve; nieuwe regels: afschot, trapformule (optrede ≤ 0,188m, aantrede ≥ 0,22m), daglicht ≥ 10% NVO, item-zonder-groep, opening-zonder-latei; expliciete ruimtefunctie-select naast keyword-fallback.

**PR F2 — Fasering ↔ model**: `modelReadiness(phases, model)` — fase "Wanden dicht" blokkeert als groepen niet gerouteerd/leidingen niet getekend (de PLAN.md §2D-belofte); Gantt krijgt afhankelijkheidspijlen + kritiek pad.

**PR F3 — PDF-export**: print-CSS verbeteren (géén jsPDF): `@page`-regels A4, page-breaks per tabblad, "Print alles"-knop, kop/voet met revisie + disclaimer. Vector-kwaliteit via "Bewaar als PDF".

**PR F4 — Opschonen**: testdekking rekenmodules compleet, dode `group`-paden weg, PLAN.md bijwerken.

---

## Risico's & mitigatie

| Risico | Mitigatie |
|---|---|
| Undo-rewrite (A1) breekt flows | Karakterisatietests vooraf; history-API behouden en verrijken; grep-checklist call-sites; één PR |
| PlanEditor-extractie verandert gestures subtiel | Eén hook per PR; vast handmatig testscript (tap/drag/pinch/long-press, desktop+touch) |
| Dexie-upgrade raakt echte data | Alleen additief; upgrades getest met fake-indexeddb; **JSON-export-knop shippen vóór v6** |
| Routering onrealistisch bij losse muren | Tolerante junction-detectie (1cm), stub-fallback, handmatige override per item |
| Constructieadvies gelezen als constructeursberekening | Disclaimer in datamodel + elke render; conservatieve tabellen (L/250) |
| BOM-sync overschrijft handwerk | Override-vlag; ordered/delivered nooit muteren; idempotentietest |

## Verificatie (end-to-end)

1. `npm test` — alle rekenmodules (takeoff, routing, structural, validation, history) groen.
2. `npm run dev` + tablet-emulatie: alles slepen (incl. deur langs muur), long-press-menu, undo van een verplaatsing, pijp achteraf verleggen.
3. Scenario: teken plan met meterkast + 6 stopcontacten in 2 groepen + waterleiding + afvoer → werkblad-Elektra toont trekkabellijst met meters; Hoeveelheden toont kabelrollen/leidingmeters/gips per pak met prijzen; 2× "Synchroniseer" → geen duplicaten.
4. Opening in dragende muur → latei-waarschuwing → "Stel voor" → profiel gekozen → verschijnt in kozijnstaat + takeoff.
5. Fase "Wanden dicht" toont blokkade zolang een groep geen route heeft.

## Kritieke bestanden

- `src/components/editor2d/PlanEditor.tsx` — bron van alle UX-werk (workstream A)
- `src/lib/history.ts` + `src/lib/db/repo.ts` → nieuw `src/lib/db/mutate.ts` — mutatielaag
- `src/lib/domain/types.ts` + `src/lib/db/db.ts` — modelwijzigingen + Dexie v6–v8
- Nieuw: `src/lib/takeoff/`, `src/lib/routing/`, `src/lib/structural/`
- `src/components/kosten/*`, `src/components/werkblad/*`, `src/lib/validation.ts`, `src/lib/phases.ts`

## Aanbevolen startvolgorde

Fase 0 → A1/A2 (grootste dagelijkse frictie weg) → B (inkoopcijfers kloppen) → C (kabeltrekplan, grootste nieuwe waarde) → D → E → F.
