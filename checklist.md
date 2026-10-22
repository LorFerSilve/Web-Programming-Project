# Web Programming — Projectchecklist

**Gekozen project:** optie 1 — Digitaal onderhouds- en reparatielogboek  
**Doel:** alle verplichte requirements correct uitvoeren, zonder onnodige extra functionaliteit.  
**Bron:** `Web programming project assignment 2627`, pagina 1, 2 en 5.

> **Werkwijze:** werk de checklist van boven naar beneden af. Een onderdeel is pas klaar als het werkt, opgeslagen blijft en getest is. De keuzes bij **Eenvoudige aanpak** zijn voorstellen, geen bijkomende eisen uit de opgave.

## 1. Basis van de applicatie

- [x] Frontend maken met **HTML, CSS en JavaScript** (Bootstrap mag).
- [x] Backend maken met **Node.js en Express.js**.
- [x] Gegevens **persistent op de server** opslaan (voorstel: SQLite).
- [x] Frontend en backend laten communiceren via HTTP/`fetch`.
- [x] Een overzichtelijke interface maken voor desktop én smartphone.
- [x] De volledige applicatie kunnen opstarten met **Docker**.

**Eenvoudige aanpak:** één Express-app die de frontend en API aanbiedt, één SQLite-database en een map voor uploads. Geen extra framework nodig.

## 2. Toestellen en gebruikers

- [x] Een gebruiker kan toestellen toevoegen, bekijken, aanpassen en verwijderen.
- [x] Een gebruiker kan **meerdere toestellen** beheren.
- [x] Per toestel basisgegevens opslaan, bijvoorbeeld naam, type, merk, model en aankoopdatum.
- [x] Per toestel een eigen detailpagina tonen met alle gekoppelde informatie.
- [ ] Gebruikersgegevens en toestellen gescheiden houden (eenvoudige login en eigen toestellen).

## 3. Onderhoud, defecten en herstellingen

- [ ] Per toestel een **onderhoudsactie** kunnen registreren.
- [ ] Per toestel een **defect** kunnen registreren.
- [ ] Per toestel een **herstelling** kunnen registreren.
- [ ] Elke registratie kunnen bekijken, aanpassen en verwijderen.
- [ ] Per registratie minstens datum en omschrijving bijhouden; optioneel ook kosten.
- [ ] Alle registraties in de juiste toestelgeschiedenis tonen.

**Eenvoudige aanpak:** één soort `registratie` met een veld `type` (`onderhoud`, `defect` of `herstelling`).

## 4. Foto's, documenten en externe informatie

- [ ] **Tekst en foto's** bij een toestel of registratie kunnen bewaren.
- [ ] Een **document** (bijvoorbeeld een PDF-handleiding of factuur) kunnen uploaden en terug openen.
- [ ] **Filmpjes** kunnen koppelen, bijvoorbeeld via een videolink.
- [ ] **Externe links** kunnen koppelen, bijvoorbeeld naar een handleiding, productpagina of instructievideo.
- [ ] Gekoppelde foto's, documenten en links eenvoudig kunnen bekijken en verwijderen.
- [ ] Minstens **één vorm van externe informatie automatisch inlezen of verwerken**.
- [ ] Daarvoor minstens **één externe API** daadwerkelijk gebruiken die een functionele meerwaarde biedt.

**Eenvoudige aanpak:** foto's en PDF's uploaden; video's als link bewaren. Via bijvoorbeeld de Wikipedia/MediaWiki API relevante toestelinformatie zoeken, een omschrijving ophalen en die aan het toestel koppelen. Zorg dat dit voor de meegeleverde voorbeeldtoestellen aantoonbaar werkt.

## 5. Mobiele interface tijdens onderhoud

- [ ] De toestelgegevens op een smartphone goed leesbaar maken.
- [ ] De onderhouds- en herstellingsinformatie mobiel makkelijk raadpleegbaar maken.
- [ ] Tijdens een onderhoudsactie snel een nieuwe registratie kunnen toevoegen.
- [ ] Tijdens een onderhoudsactie meteen een foto kunnen toevoegen (ook via de camera van een telefoon).
- [ ] Gekoppelde instructies/documenten mobiel makkelijk kunnen openen.

**Eenvoudige aanpak:** responsive Bootstrap-pagina's, grote knoppen en een eenvoudig formulier. Een aparte mobiele app is niet nodig.

## 6. Onderhoud plannen en meldingen

- [ ] Voor een toestel toekomstig onderhoud kunnen plannen (datum + omschrijving).
- [ ] Gepland onderhoud persistent opslaan en terug tonen.
- [ ] Duidelijk tonen welk onderhoud **binnenkort gepland** is.
- [ ] Duidelijk tonen welk onderhoud **te laat** is.
- [ ] De gebruiker een **melding** kunnen geven wanneer onderhoud nadert of overschreden is.

**Eenvoudige aanpak:** bij het openen van de applicatie geplande datums controleren en meldingen binnen de applicatie tonen. Eventueel ook een browsernotificatie tonen wanneer de gebruiker hiervoor toestemming gaf. Geen complexe achtergrondservice nodig.

## 7. Interactieve historiek en kostenoverzicht

- [ ] Per toestel een duidelijk overzicht van alle onderhoudsacties, defecten en herstellingen tonen.
- [ ] De historiek interactief maken, bijvoorbeeld met filters op type of datum.
- [ ] De historiek aantrekkelijk presenteren (bijvoorbeeld een tijdlijn of tabel met statuslabels).
- [ ] Indien kosten zijn ingevuld: kosten per registratie en totaal per toestel tonen.

**Eenvoudige aanpak:** een chronologische tabel met filters en een eenvoudig totaalbedrag. Complexe grafieken zijn niet verplicht.

## 8. Afdrukken en PDF

- [ ] De **volledige onderhoudshistoriek van een toestel** op één overzichtelijke pagina kunnen weergeven.
- [ ] Die historiek netjes kunnen **afdrukken**, zonder onnodige navigatieknoppen.
- [ ] Die historiek als **PDF kunnen exporteren**.
- [ ] Controleren of datums, omschrijvingen, kosten en relevante toestelgegevens correct op de afdruk/PDF staan.

**Eenvoudige aanpak:** een aparte afdrukweergave met print-CSS en een printknop. Voor expliciete PDF-export een werkende downloadmogelijkheid toevoegen; alleen een mooie webpagina is niet genoeg.

## 9. Verplichte browser-API's (minstens 3)

- [ ] **Fetch API:** toestel- en onderhoudsgegevens ophalen/versturen naar Express.
- [ ] **Web Storage API (`localStorage`):** bijvoorbeeld een onafgewerkt formulier bewaren en herstellen.
- [ ] **Notifications API:** browsermeldingen voor naderend/achterstallig onderhoud, na toestemming.
- [ ] Controleren dat deze drie API's **daadwerkelijk een nuttige functie** hebben in de applicatie.
- [ ] Een bruikbare terugval voorzien als browsernotificaties niet ondersteund of geweigerd worden (meldingen op de pagina).

> De Fetch API is expliciet verplicht in de opgave. De twee andere voorbeelden hierboven zijn een eenvoudige keuze uit de toegestane browser-API's.

## 10. Twee zelfbedachte functionele uitbreidingen

- [ ] **Uitbreiding 1 — Garantiebeheer:** aankoopdatum en garantie-einddatum opslaan en tonen of een toestel nog onder garantie valt.
- [ ] **Uitbreiding 2 — Herbruikbare onderhoudschecklists:** een eigen checklist met taken maken, bewaren en opnieuw gebruiken bij een onderhoudsactie.
- [ ] Voor beide uitbreidingen nagaan dat ze **boven op de minimumrequirements** komen en niet letterlijk een verboden voorbeeld uit de opgave overnemen.

## 11. Docker en demo-inhoud

- [ ] Een `Dockerfile` maken.
- [ ] Een eenvoudige `compose.yaml` toevoegen.
- [ ] Databasegegevens en geüploade bestanden bewaren na herstart van de container.
- [ ] Voorbeeldgegevens meeleveren: minstens een demo-gebruiker, enkele toestellen, onderhoudsacties, defecten, herstellingen en gepland onderhoud.
- [ ] Een `README.md` schrijven met opstartinstructies en eventuele demo-inloggegevens.
- [ ] Testen of de docent de applicatie vanaf een **schone installatie** probleemloos kan starten.
- [ ] Controleren dat de externe API, afbeeldingen, voorbeelddata en PDF-export werken in Docker.

## 12. Eindcontrole vóór indienen

- [ ] Alle bovenstaande verplichte onderdelen zijn geïmplementeerd (geen knoppen zonder werking of alleen maar mockdata).
- [ ] Toegevoegde, gewijzigde en verwijderde gegevens blijven correct na vernieuwen van de pagina.
- [ ] Toestellen en registraties van verschillende gebruikers worden niet door elkaar getoond.
- [ ] Ongeldige of ontbrekende invoer veroorzaakt geen servercrashes; er verschijnt een begrijpelijke foutmelding.
- [ ] Foto-/documentuploads en externe API-fouten worden correct afgehandeld.
- [ ] De interface is bruikbaar op zowel desktop als smartphone.
- [ ] Afdrukken en PDF-export zijn handmatig gecontroleerd.
- [ ] De drie browser-API's, de externe API en de twee uitbreidingen zijn zichtbaar te demonstreren.
- [ ] `docker compose up --build` werkt vanuit een schone projectmap volgens de README.

---

## Buiten scope: niet bouwen tenzij echt nodig

- React, Vue, TypeScript of andere extra frontendframeworks.
- Een microservicesarchitectuur of meerdere databases.
- AI-functies, automatische onderhoudsvoorspellingen of QR-codes.
- Een aparte native mobiele applicatie.
- Complexe grafieken, realtime synchronisatie of pushberichten terwijl de app gesloten is.
- Extra functies die niet in de opdracht staan of niet bijdragen aan één van de twee gekozen uitbreidingen.

**Klaar = alle verplichte requirements aantoonbaar werkend, inclusief de twee uitbreidingen en de Docker-oplevering.**
