# Onderhoudslogboek

Web Programming 2026–2027 — optie 1: digitaal onderhouds- en reparatielogboek.

## Starten met Docker

Installeer en start **Docker Desktop** (met Docker Compose). Je hoeft hiervoor
geen Node.js of npm lokaal te installeren. Stop wel eerst een eventuele
`npm start`-server op poort 3000.

Start de applicatie vanuit de projectmap:

```powershell
docker compose up --build -d
```

Open **http://localhost:3000**. Controleer de API via
**http://localhost:3000/api/health** (antwoord: `{"status":"ok"}`).

De container draait met Node.js 24 en maakt een SQLite-database aan op
`/app/data/maintenance.sqlite`. De map `/app/data` is gekoppeld aan
het Docker-volume `maintenance_data`. Toegevoegde toestellen blijven dus
bewaard als je de container stopt, verwijdert of opnieuw opbouwt.

Je kunt de opslag controleren door een toestel toe te voegen via de interface,
de applicatie te stoppen en opnieuw te starten:

```powershell
docker compose down
docker compose up -d
```

Vernieuw daarna de pagina: het toestel hoort nog aanwezig te zijn.

Handige commando's:

```powershell
docker compose logs -f app
docker compose down
```

**Let op:** gebruik geen `docker compose down -v` als je de gegevens
wilt behouden: `-v` verwijdert ook het databasevolume.

**Belangrijk:** de SQLite-database in het Docker-volume staat los van het
lokale bestand `data/maintenance.sqlite` dat je via `npm start` gebruikt.
Eerder lokaal ingevoerde toestellen verdwijnen niet, maar verschijnen
niet automatisch in de Docker-installatie. Ze blijven in je lokale database
beschikbaar wanneer je weer `npm start` gebruikt.

Op dit moment bevat een nieuwe database nog geen voorbeeldgegevens of
demo-gebruikers. Die horen bij de latere projectvereisten.

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
- `POST /api/devices` voegt een toestel toe met JSON-velden `name`, `type`, optioneel `brand`, `model`, `purchaseDate` en `nextMaintenance` (datums als YYYY-MM-DD).
- `PUT /api/devices/:id` past de gegevens van een bestaand toestel aan (volledig JSON-object).
- `DELETE /api/devices/:id` verwijdert een toestel na bevestiging in de frontend (HTTP 204).

Voorbeeld in PowerShell (terwijl `npm start` draait):

```powershell
Invoke-RestMethod http://localhost:3000/api/devices -Method Post -ContentType 'application/json' -Body '{"name":"Stadsfiets","type":"fiets","brand":"Gazelle"}'
Invoke-RestMethod http://localhost:3000/api/devices
```

De **aankoopdatum** is optioneel en wordt bij toevoegen, bewerken en bekijken van een toestel ondersteund. Bestaande SQLite-databases worden bij het opstarten automatisch uitgebreid met de nieuwe kolom; bestaande toestellen en hun overige gegevens blijven behouden.

**Belangrijk:** het dashboard toont nu uitsluitend toestellen uit SQLite, dus een nieuwe database heeft eerst een lege lijst. Gebruik **Toestel toevoegen** in de browser of de API om nieuwe toestellen aan te maken. Via **Bekijk details** kun je een toestel bewerken of na bevestiging verwijderen. Alle wijzigingen worden in SQLite bewaard. Onderhoud, defecten en gebruikersbeheer volgen in latere stappen uit `checklist.md`.

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

## Toesteldetailpagina

Elk toestel heeft een eigen, rechtstreeks te openen adres: `/devices/<id>`.
Klik op **Bekijk details** in het overzicht om erheen te gaan. De pagina
haalt het toestel afzonderlijk op via `GET /api/devices/:id` en toont
categorie, merk, model, aankoopdatum en onderhoudsdatum. Bewerken en
verwijderen blijft op de detailpagina mogelijk en gebruikt dezelfde SQLite-API.
Een niet-bestaand toestel levert een HTTP 404 op.

De onderdelen **onderhoudshistoriek** en **foto's/documenten/links** hebben al
een duidelijke plaats op de pagina; de daadwerkelijke registraties en bijlagen
volgen in de latere checklistonderdelen. Er worden nog geen fictieve gegevens getoond.

## Gebruikers en toegangscontrole

Maak na de eerste opstart via **http://localhost:3000/login** je eerste
account aan (naam, e-mailadres, wachtwoord van minstens 10 tekens).
Daarna kun je inloggen, uitloggen en uitsluitend je eigen toestellen beheren.

**Migratie van bestaande gegevens:** bij de allereerste registratie krijgt
het eerste account automatisch de toestellen die vóór de invoering van
accounts zijn aangemaakt. De SQLite-migratie bewaart hun ID en gegevens.
**Registreer daarom zelf het eerste account voordat je andere gebruikers
toegang geeft tot je lokale installatie.** Dit is bedoeld voor de overgang
van een bestaande, voorheen eenpersoonsdatabase; plaats de applicatie niet
publiek online vóór deze eerste registratie. Nieuwe accounts krijgen een
lege toestellenlijst.

Wachtwoorden worden niet als platte tekst bewaard: de backend gebruikt
een unieke salt en `scrypt`. Sessies worden opgeslagen in SQLite en
geïdentificeerd via een willekeurige, gehashte token. De browser ontvangt
een `HttpOnly`-/`SameSite=Lax`-cookie (zeven dagen geldig). Uitloggen
maakt de sessie ongeldig. Alle toestel-API's, inclusief rechtstreeks
ophalen, bewerken en verwijderen, controleren de ingelogde gebruiker.

API-overzicht:
- `POST /api/auth/register` — nieuw account (`name`, `email`, `password`);
- `POST /api/auth/login` — aanmelden (`email`, `password`);
- `GET /api/auth/me` — huidige gebruiker;
- `POST /api/auth/logout` — sessie verwijderen;
- `/api/devices` en `/api/devices/:id` vereisen altijd een sessie.

**Beveiligingsgrens:** deze configuratie is geschikt voor lokale ontwikkeling
en demonstratie. Zet haar niet rechtstreeks op het publieke internet zonder
HTTPS, een passende reverse proxy en aanvullende beveiliging zoals
aanmeldpogingbeperking. Er is in deze projectfase geen
wachtwoordherstel of e-mailverificatie.
