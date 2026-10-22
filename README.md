# Onderhoudslogboek

Web Programming 2026–2027 — optie 1: digitaal onderhouds- en reparatielogboek.

## Lokaal starten

Je hebt **Node.js 20 of nieuwer** en npm nodig.

```bash
npm install
npm start
```

Open daarna **http://localhost:3000** in je browser. Express serveert de bestaande frontend uit `public/`.

De backend controleren kan via **http://localhost:3000/api/health**. Die route geeft `{"status":"ok"}` terug.

Tests uitvoeren:

```bash
npm test
```

## Huidige functionaliteit

- Responsive HTML/CSS/JavaScript-frontend met voorbeeldtoestellen, zoeken, filteren en een toevoegformulier.
- Node.js/Express-server die de frontendbestanden aanbiedt.
- `GET /api/health` als eenvoudige JSON-test van de backend.

**Nog niet geïmplementeerd:** database, server-side opslag van toestellen en communicatie via `fetch` tussen frontend en backend. Het toevoegformulier slaat gegevens voorlopig alleen in het browsergeheugen op. Dit zijn afzonderlijke vervolgstappen in `checklist.md`.

## Projectstructuur

- `server.js`: start de HTTP-server.
- `src/app.js`: Express-app, routes en statische bestanden.
- `public/`: de bestaande frontend (`index.html`, `styles.css`, `app.js`).
- `test/server.test.js`: HTTP-tests met de ingebouwde Node.js-testmodule.
- `checklist.md`: voortgang van alle projectvereisten.
