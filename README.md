# Onderhoudslogboek

Web Programming 2026–2027 — optie 1: digitaal onderhouds- en reparatielogboek.

## Lokaal starten

**Node.js 22.13+ vereist; Node.js 24 LTS aanbevolen** voor de ingebouwde SQLite-module.

```bash
npm install
npm start
```

Open **http://localhost:3000** voor de applicatie. De frontend haalt toestellen met `fetch` op bij Express en slaat nieuwe toestellen rechtstreeks op in SQLite. Open de HTML dus **via deze server**, niet als los bestand (`file://`).
Controleer de backend via **http://localhost:3000/api/health** (`{"status":"ok"}`).

## Persistente opslag

De server maakt bij de eerste start automatisch `data/maintenance.sqlite` aan.
Toestellen worden in deze SQLite-database bewaard, **ook na herstart van Node.js**.
De database staat in `.gitignore`, zodat lokale gegevens niet op GitHub belanden.
Met de optionele omgevingsvariabele `DB_PATH` kun je de bestandslocatie wijzigen
(bijvoorbeeld voor een latere Docker-volume).

De eenvoudige toestellen-API is alvast beschikbaar:

- `GET /api/devices` geeft de opgeslagen toestellen als JSON terug.
- `POST /api/devices` voegt een toestel toe met JSON-velden `name`, `type`, optioneel `brand`, `model` en `nextMaintenance` (YYYY-MM-DD).

Voorbeeld in PowerShell (terwijl `npm start` draait):

```powershell
Invoke-RestMethod http://localhost:3000/api/devices -Method Post -ContentType 'application/json' -Body '{"name":"Stadsfiets","type":"fiets","brand":"Gazelle"}'
Invoke-RestMethod http://localhost:3000/api/devices
```

**Belangrijk:** het dashboard toont nu uitsluitend toestellen uit SQLite, dus een nieuwe database heeft eerst een lege lijst. Gebruik **Toestel toevoegen** in de browser of de API om nieuwe toestellen aan te maken. Onderhoud, defecten en gebruikersbeheer volgen in latere stappen uit `checklist.md`.

## Tests

```bash
npm test
```

## Projectstructuur

- `server.js`: start Express en opent de database.
- `src/app.js`: Express-routes en statische frontend.
- `src/database.js`: SQLite-schema en opslagfuncties.
- `public/`: HTML, CSS en vanilla JavaScript.
- `test/`: API- en database-tests.
- `checklist.md`: voortgang van het project.

## Responsive interface

De bestaande interface past zich aan verschillende schermbreedtes aan:
op desktop staan de toestellen in drie kolommen, op tablet in twee kolommen
en op smartphone in één kolom. Op smalle telefoons staan ook de
samenvattingskaarten onder elkaar, blijven knoppen goed bedienbaar en kan
het toevoegformulier verticaal scrollen.

Je kunt dit zelf controleren met de **Device Toolbar** in de browser
(`F12` → `Ctrl+Shift+M`) op bijvoorbeeld 320, 390, 768 en 1440 pixels.
De mobiele interface voor het **registreren van onderhoudsacties en foto's**
komt later, bij de bijbehorende requirements.
