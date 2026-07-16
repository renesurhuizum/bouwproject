# Bouwproject — Digital Twin

Offline-first PWA voor het plannen en uitvoeren van de renovatie van een woonboerderij. Wat je in de app ontwerpt, bouw je daarna in het echt: alles is gemaatvoerd in meters, zodat de app echte werktekeningen kan produceren.

## Features

- **Plattegrond** (`/plattegrond`) — 2D-editor met muren (dikte, hoogte, materiaal, dragend, status bestaand/nieuw/sloop), verdiepingen, ruimtes met automatische m², deuren/ramen/doorgangen, trappen, kolommen, stalen balken, daken + dakkapellen, doorsnedelijnen, meubels en installatielagen (elektra, water, ventilatie).
- **3D** (`/3d`) — automatische extrusie van de plattegrond, walkthrough, zonnestand, texturen, doorsnede en screenshot-export.
- **Aanzichten & werkblad** (`/aanzichten`, `/werkblad`) — gemaatvoerde gevelaanzichten, kozijnstaat, doorsnedes, PNG-export, tekeningschaal en revisies.
- **Fasering** (`/fases`) — renovatiefases met afhankelijkheden en Gantt: de app blokkeert taken waarvan de voorwaarden nog niet klaar zijn ("sluit de wand niet vóór de leidingen erin zitten").
- **Kosten** (`/kosten`) — budget, uitgaven, materiaallijst en hoeveelheidsstaat.
- **Validatie** — ingebouwde controles op basis van NEN 1010, NEN 2580 en bouwregelgeving (dragende muren, ruimte-minima, aansluitingen per ruimte).

Alle data staat lokaal op het apparaat (IndexedDB); er is geen backend. Maak regelmatig een backup via Instellingen.

## Tech stack

Next.js (App Router) · React · TypeScript (strict) · Konva (2D) · react-three-fiber (3D) · Dexie (IndexedDB) · Zustand · Tailwind CSS v4 · Recharts

## Ontwikkelen

```bash
npm ci          # dependencies installeren
npm run dev     # dev-server op http://localhost:3000
npm test        # unit-tests (Vitest)
npm run lint    # ESLint
npm run typecheck
npm run build   # productie-build
```

Let op: dit project gebruikt een nieuwere Next.js met breaking changes — raadpleeg `node_modules/next/dist/docs/` en `AGENTS.md` voordat je code schrijft.

## Documentatie

- [`PLAN.md`](PLAN.md) — visie, spec en roadmap.
- [`docs/VERBETERANALYSE-2026-07.md`](docs/VERBETERANALYSE-2026-07.md) — verbeteranalyse met geprioriteerde aanbevelingen.
