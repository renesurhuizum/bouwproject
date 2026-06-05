# Bouwproject — Digital Twin Renovatie-app

> Een app om de volledige renovatie van een oude woonboerderij te plannen, ontwerpen en
> uitvoeren. Een digitale tweeling: wat je in de app bouwt, bouw je daarna in het echt na.

---

## 1. Visie & kernfilosofie

Drie dingen tegelijk:

1. **Ontwerpen** — 2D plattegrond tekenen, in 3D doorlopen. Muren, hoogtes, deuren, ramen.
2. **Installeren bepalen** — waar komt elk stopcontact, schakelaar, lichtpunt, waterleiding,
   afvoer, cv/vloerverwarming. Op exacte hoogte en positie.
3. **Uitvoeren** — fasering met afhankelijkheden ("eerst dit, dan dat"), kosten/budget,
   checklists per ruimte, en **werktekeningen** die je meeneemt naar de bouwplaats.

**Leidend principe — alles is een maat.** Alles in millimeters/meters, zodat de app
echte werktekeningen en maatvoering oplevert. De digital twin is pas waardevol als je hem
exact kunt nabouwen.

**Offline-first.** Op een bouwplaats is geen/slecht internet. De app moet volledig
offline werken op telefoon/tablet, met lokale opslag en export/back-up.

---

## 2. Functionele modules

### A. Plattegrond-editor (2D)
- Muren tekenen met snapping (rasterlijnen, hoeken, bestaande muren)
- Per muur: lengte, dikte, **hoogte**, materiaal, en status: *bestaand / nieuw / slopen*
- **Dragend/niet-dragend** markeren — cruciaal: dragende muren niet zomaar weghalen
- Verdiepingen/lagen: kelder, begane grond, verdieping, zolder
- Ruimtes herkennen (automatisch oppervlak berekenen: m², omtrek)
- Deuren & ramen op muren plaatsen (sparingen), met afmetingen en borsthoogte

### B. Installaties-laag
Schakelbare lagen bovenop de plattegrond:
- **Elektra**: stopcontacten, schakelaars, lichtpunten, data/UTP, meterkast/groepen.
  Per element: hoogte vanaf vloer, positie, op welke groep.
  *Slimme defaults (NL):* stopcontact 30 cm, schakelaar 105 cm, keuken boven blad 110 cm.
- **Water**: aanvoer warm/koud, afvoer (diameter + afschot), tappunten
  (kraan, toilet, douche, wasmachine, cv-ketel)
- **Verwarming**: cv-leidingen, radiatoren, vloerverwarming-verdelers
- **Ventilatie**: kanalen, roosters, WTW-unit

### C. 3D-weergave
- Plattegrond wordt automatisch geëxtrudeerd naar 3D (muren omhoog op hun hoogte)
- Door het huis **lopen** (first-person/orbit camera)
- Installatie-elementen zichtbaar op hun echte 3D-positie/hoogte
- Lagen aan/uit (bv. alleen casco, of casco + elektra)

### D. Fasering & planning (de "handvaten")
- Renovatie opgedeeld in fases met **afhankelijkheden** (zie §4)
- Taken per fase, per ruimte
- Waarschuwingen: "Je kunt deze wand niet dichtmaken — elektra eerste fase nog niet afgevinkt"
- Tijdlijn/Gantt-achtig overzicht; wat kan parallel, wat is kritisch pad

### E. Kosten & budget
- Budget per fase / categorie / ruimte
- Uitgaven boeken: bedrag, datum, leverancier, categorie, bonnetje (foto), gekoppeld aan fase/ruimte
- Materiaallijst (BOM): wat heb je nodig, wat is besteld, wat is geleverd
- Overzicht: begroot vs. werkelijk, per fase en totaal

### F. Werkmodus (op de bouwplaats)
- Per ruimte: **wandaanzichten** (elevatie-tekeningen) met exacte hoogtes van stopcontacten,
  schakelaars, leidingen — precies wat je nodig hebt om af te tekenen op de muur
- Checklist per fase/ruimte, afvinkbaar
- Foto's koppelen aan ruimtes/elementen (voortgang, "zo loopt de leiding achter de muur")

---

## 3. Datamodel (kern-entiteiten)

```
Project
 └─ Level (verdieping)        z-hoogte, naam
     ├─ Wall                  start[x,y], eind[x,y], dikte, hoogte, materiaal,
     │                        dragend?, status(bestaand/nieuw/sloop)
     ├─ Opening               wall-ref, type(deur/raam), breedte, hoogte, borsthoogte, positie
     ├─ Room                  polygon(muur-refs), naam, functie, oppervlak(berekend)
     ├─ ElectricalItem        type, positie[x,y], hoogte-z, groep-ref, wall-ref?
     ├─ PlumbingItem          type(aanvoer/afvoer/tappunt), path/positie, diameter
     └─ HvacItem              type, positie/path
Phase                         naam, volgorde, status, afhankelijkheden[phase-refs]
 └─ Task                      titel, fase-ref, ruimte-ref?, status, checklist
Budget                        fase/categorie, begroot bedrag
Expense                       bedrag, datum, leverancier, categorie, fase-ref?, ruimte-ref?, bon
MaterialItem                  naam, aantal, eenheid, prijs, status(nodig/besteld/geleverd)
Photo                         url, gekoppeld aan ruimte/element/taak
```

Coördinaten in **meters**, hoogtes in **meters**, opgeslagen met mm-precisie.

---

## 4. Fasering-engine — de juiste volgorde (NL-renovatie)

De kern van de "perfecte handvaten". Standaard-fases met afhankelijkheden, aanpasbaar:

| # | Fase | Mag pas starten als | Waarom |
|---|------|---------------------|--------|
| 1 | Voorbereiding & ontwerp | — | Opmeten, vergunning, definitief ontwerp |
| 2 | Sloop | 1 klaar | Weghalen wat weg moet |
| 3 | Constructief | 2 klaar | Fundering, stalen balken/lateien, dragende wijzigingen |
| 4 | Ruwbouw / casco | 3 klaar | Nieuwe muren, dak, wind- en waterdicht |
| 5 | Installaties — 1e fase | 4 klaar | Bedrading + leidingen **in** de muren/vloer, vóór dichtmaken |
| 6 | Isolatie | 4 klaar | Muur, dak, vloer |
| 7 | Wanden dicht (gipsplaat) | 5 + 6 klaar | **Niet eerder** — leidingen moeten erin zitten |
| 8 | Stucwerk / spack | 7 klaar | Wanden en plafonds afwerken |
| 9 | Dekvloer | 5 (vloerverw.) klaar | Pas gieten als vloerverwarming ligt |
| 10 | Installaties — 2e fase | 8 + 9 klaar | Stopcontacten/schakelaars/kranen monteren |
| 11 | Afwerking | 10 klaar | Tegelwerk, vloeren, schilderen, keuken, badkamer |
| 12 | Oplevering | 11 klaar | Controle, restpunten |

De engine bewaakt: *"deze taak kan nog niet — voorwaarde X niet voldaan."* Dit voorkomt
de klassieke renovatie-fout (muur dicht vóórdat de elektra erin zit).

---

## 5. Tech stack (voorstel)

| Onderdeel | Keuze | Waarom |
|-----------|-------|--------|
| Framework | **Next.js 15** (App Router) + TypeScript | PWA op telefoon, draait op Vercel |
| 3D | **React Three Fiber** + drei | Plattegrond → 3D, door huis lopen |
| 2D-editor | **react-konva** (canvas) | Muren tekenen met snapping |
| State | **Zustand** | Eén genormaliseerde store |
| Opslag | **Dexie.js (IndexedDB)** | Offline-first, lokaal; later cloud-sync |
| UI | **Tailwind + shadcn/ui** | Snel, strak, toegankelijk |
| Grafieken | Recharts | Kostenoverzichten |
| Maat/PDF | jsPDF / print-CSS | Werktekeningen exporteren |

Offline-first lokaal nu; cloud-sync (bv. Postgres via Vercel Marketplace) kan later
erbovenop, zodat telefoon + laptop synchroniseren.

---

## 6. Bouwvolgorde van de app zelf (incrementeel)

**MVP-fase 1 — Fundament & plattegrond**
- Project-opzet (Next.js, Dexie, store, UI-shell)
- 2D plattegrond-editor: muren tekenen, hoogte/dikte/materiaal, verdiepingen
- Ruimtes + automatische m²-berekening

**Fase 2 — 3D**
- Extrusie naar 3D, door huis lopen, lagen aan/uit

**Fase 3 — Installaties**
- Elektra-, water-, cv-laag met slimme NL-defaults
- Zichtbaar in 2D én 3D

**Fase 4 — Fasering & kosten**
- Fasering-engine met afhankelijkheden, taken/checklists
- Budget + uitgaven + materiaallijst

**Fase 5 — Werkmodus & export**
- Wandaanzichten met maatvoering, PDF-export, foto's, on-site checklists

---

## 7. Open keuzes (jouw beslissing)

1. **Gebruik je het vooral op telefoon/tablet op de bouwplaats, of op de laptop thuis?**
   (Bepaalt hoeveel nadruk op offline + touch-bediening.)
2. **Alles lokaal op één apparaat, of synchroniseren tussen telefoon én laptop?**
   (Lokaal = simpeler en sneller; sync = meer werk maar overal bij.)
3. **Bestaande plattegrond?** Heb je tekeningen/maten van de boerderij, of teken je from scratch?
   (Een foto/PDF als onderlegger inladen om overheen te tekenen kan enorm schelen.)
