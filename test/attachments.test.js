import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import createApp from "../src/app.js";
import {
  openDatabase, createUser, addDevice, getDevice, updateDevice, addRegistration
} from "../src/database.js";

const device = (name, notes = "") => ({
  name, type: "fiets", brand: "Gazelle", model: "Esprit",
  nextMaintenance: "", purchaseDate: "", notes
});
const registration = () => ({
  type: "onderhoud", date: "2026-10-22", description: "Remmen nagekeken", cost: null
});
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,73,72,68,82]);
const pdf = Buffer.from("%PDF-1.7\nEen PDF-handleiding", "utf8");

async function fixture(callback, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-files-"));
  const uploadDir = path.join(dir, "uploads");
  const db = openDatabase(path.join(dir, "test.sqlite"));
  const app = createApp(db, { uploadDir, wikiFetch: options.wikiFetch });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await callback({
      base: `http://127.0.0.1:${server.address().port}`,
      db, uploadDir
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
async function account(base, name, email) {
  const result = await fetch(base + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "veilig-wachtwoord-123" })
  });
  assert.equal(result.status, 200);
  return result.headers.get("set-cookie").split(";")[0];
}
async function request(base, resource, cookie = null, method = "GET", body = undefined, headers = {}) {
  return fetch(base + resource, {
    method, redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body })
  });
}
async function json(base, resource, cookie, method, payload) {
  return request(base, resource, cookie, method, JSON.stringify(payload),
    { "Content-Type": "application/json" });
}
async function createDevice(base, cookie, name) {
  const response = await json(base, "/api/devices", cookie, "POST", device(name));
  assert.equal(response.status, 201);
  return response.json();
}
async function upload(base, cookie, deviceId, filename, body, mime, registrationId = null) {
  const url = `/api/devices/${deviceId}/attachments/file` +
    (registrationId ? `?registrationId=${registrationId}` : "");
  return request(base, url, cookie, "POST", body, {
    "Content-Type": mime, "X-Filename": encodeURIComponent(filename)
  });
}

test("Toestelnotities worden opgeslagen en kunnen aangepast worden", async () => {
  await fixture(async ({ base }) => {
    const cookie = await account(base, "Alice", "notes@example.org");
    const created = await json(base, "/api/devices", cookie, "POST",
      device("Stadsfiets", "Sleutel ligt in de garage"));
    assert.equal(created.status, 201);
    const saved = await created.json();
    assert.equal(saved.notes, "Sleutel ligt in de garage");
    const updated = await json(base, `/api/devices/${saved.id}`, cookie, "PUT",
      device("Stadsfiets", "Reserveonderdelen in de kast"));
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).notes, "Reserveonderdelen in de kast");
    assert.equal((await (await request(base, `/api/devices/${saved.id}`, cookie)).json()).notes,
      "Reserveonderdelen in de kast");
    assert.equal((await json(base, `/api/devices/${saved.id}`, cookie, "PUT",
      device("Fiets", "x".repeat(5001)))).status, 400);
  });
});

test("Oude toestellen worden gemigreerd met een leeg notitieveld", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-legacy-notes-"));
  const file = path.join(dir, "maintenance.sqlite");
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      next_maintenance TEXT NOT NULL DEFAULT '',
      purchase_date TEXT NOT NULL DEFAULT '', user_id INTEGER
    );
    INSERT INTO devices (name, type) VALUES ('Oud toestel', 'apparaat');`);
    old.close();
    const db = openDatabase(file);
    const user = createUser(db, "Eigenaar", "eigenaar@example.org", "dummyhash");
    assert.equal(getDevice(db, user.id, 1).notes, "");
    const d = getDevice(db, user.id, 1);
    const update = updateDevice(db, user.id, 1, { ...d, notes: "Nieuwe notitie" });
    assert.equal(update.notes, "Nieuwe notitie");
    db.close();
    const reopened = openDatabase(file);
    assert.equal(getDevice(reopened, user.id, 1).notes, "Nieuwe notitie");
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Foto's en PDF's zijn na upload en herladen uitsluitend voor eigenaar beschikbaar", async () => {
  await fixture(async ({ base, uploadDir }) => {
    const alice = await account(base, "Alice", "files-a@example.org");
    const bob = await account(base, "Bob", "files-b@example.org");
    const d = await createDevice(base, alice, "Fiets");
    const imgResponse = await upload(base, alice, d.id, "fiets.png", png, "image/png");
    assert.equal(imgResponse.status, 201);
    const image = await imgResponse.json();
    assert.equal(image.kind, "photo");
    assert.equal(image.originalName, "fiets.png");
    assert.equal(Object.hasOwn(image, "storedName"), false);
    const docResponse = await upload(base, alice, d.id, "handleiding.pdf", pdf, "application/pdf");
    assert.equal(docResponse.status, 201);
    const document = await docResponse.json();
    assert.equal(document.kind, "document");
    assert.deepEqual((await (await request(base, `/api/devices/${d.id}/attachments`, alice)).json())
      .map(item => item.id), [document.id, image.id]);
    const imgUrl = `/api/devices/${d.id}/attachments/${image.id}/file`;
    const pdfUrl = `/api/devices/${d.id}/attachments/${document.id}/file`;
    const opened = await request(base, imgUrl, alice);
    assert.equal(opened.status, 200);
    assert.deepEqual(Buffer.from(await opened.arrayBuffer()), png);
    assert.equal((await request(base, pdfUrl, alice)).status, 200);
    const downloaded = await request(base, pdfUrl, alice);
    assert.match(downloaded.headers.get("content-disposition"), /attachment/);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
    assert.equal((await request(base, imgUrl, bob)).status, 404);
    assert.equal((await request(base, pdfUrl)).status, 401);
    assert.equal(readdirSync(uploadDir).length, 2);
    assert.equal((await request(base,
      `/api/devices/${d.id}/attachments/${image.id}`, alice, "DELETE")).status, 204);
    assert.equal((await request(base, imgUrl, alice)).status, 404);
    assert.equal(readdirSync(uploadDir).length, 1);
  });
});

test("Ongeldige, gevaarlijke en te grote bestanden worden geweigerd", async () => {
  await fixture(async ({ base, uploadDir }) => {
    const cookie = await account(base, "Alice", "files-invalid@example.org");
    const d = await createDevice(base, cookie, "Fiets");
    assert.equal((await upload(base, cookie, d.id, "script.svg", Buffer.from("<svg/>"), "image/svg+xml")).status, 400);
    assert.equal((await upload(base, cookie, d.id, "fout.pdf", Buffer.from("geen pdf"), "application/pdf")).status, 400);
    assert.equal((await upload(base, cookie, d.id, "fout.png", pdf, "image/png")).status, 400);
    assert.equal((await upload(base, cookie, d.id, "leeg.png", Buffer.alloc(0), "image/png")).status, 400);
    const huge = await upload(base, cookie, d.id, "groot.pdf",
      Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]), "application/pdf");
    assert.equal(huge.status, 413);
    assert.equal((await request(base, `/api/devices/${d.id}/attachments`, cookie)).status, 200);
    assert.deepEqual(await (await request(base, `/api/devices/${d.id}/attachments`, cookie)).json(), []);
    // Mislukte uploads maken geen bestanden aan.
    assert.equal(existsSync(uploadDir) ? readdirSync(uploadDir).length : 0, 0);
  });
});

test("Video- en handleidinglinks worden gevalideerd en kunnen verwijderd worden", async () => {
  await fixture(async ({ base }) => {
    const cookie = await account(base, "Alice", "links@example.org");
    const d = await createDevice(base, cookie, "Fiets");
    const url = `/api/devices/${d.id}/attachments`;
    const link = await json(base, url, cookie, "POST",
      { label: "Fietsreparatie video", url: "https://www.youtube.com/watch?v=abcd" });
    assert.equal(link.status, 201);
    const saved = await link.json();
    assert.equal(saved.kind, "link");
    assert.equal(saved.url, "https://www.youtube.com/watch?v=abcd");
    for (const bad of [
      { label: "script", url: "javascript:alert(1)" },
      { label: "lokale file", url: "file:///etc/passwd" },
      { label: "", url: "https://example.com" },
      { label: "auth", url: "https://user:pass@example.com/private" }
    ]) assert.equal((await json(base, url, cookie, "POST", bad)).status, 400);
    assert.equal((await request(base, `${url}/${saved.id}`, cookie, "DELETE")).status, 204);
    assert.deepEqual(await (await request(base, url, cookie)).json(), []);
  });
});

test("Bijlagen kunnen bij één registratie gekoppeld worden, niet bij een ander toestel", async () => {
  await fixture(async ({ base, uploadDir }) => {
    const alice = await account(base, "Alice", "attachrecord-a@example.org");
    const bob = await account(base, "Bob", "attachrecord-b@example.org");
    const d = await createDevice(base, alice, "Fiets");
    const other = await createDevice(base, alice, "Auto");
    const foreign = await createDevice(base, bob, "Printer");
    const rec = await (await json(base, `/api/devices/${d.id}/registrations`, alice, "POST", registration())).json();
    const baseUrl = `/api/devices/${d.id}/attachments`;
    const recordFile = await upload(base, alice, d.id, "rem.png", png, "image/png", rec.id);
    assert.equal(recordFile.status, 201);
    const photo = await recordFile.json();
    assert.equal(photo.registrationId, rec.id);
    assert.equal((await json(base, `/api/devices/${other.id}/attachments`, alice, "POST",
      { label: "fout", url: "https://example.com", registrationId: rec.id })).status, 400);
    assert.equal((await upload(base, bob, d.id, "fake.png", png, "image/png")).status, 404);
    assert.equal((await upload(base, alice, other.id, "fake.png", png, "image/png", rec.id)).status, 400);
    assert.equal((await request(base, `/api/devices/${foreign.id}/attachments/${photo.id}/file`, bob)).status, 404);
    assert.equal((await request(base, baseUrl, bob)).status, 404);
    assert.equal((await request(base, `/api/devices/${d.id}/registrations/${rec.id}`,
      alice, "DELETE")).status, 204);
    assert.deepEqual(await (await request(base, baseUrl, alice)).json(), []);
    assert.equal(readdirSync(uploadDir).length, 0);
  });
});

test("Toestel verwijderen ruimt alle gekoppelde documenten en foto's op", async () => {
  await fixture(async ({ base, uploadDir }) => {
    const cookie = await account(base, "Alice", "deletefiles@example.org");
    const d = await createDevice(base, cookie, "Fiets");
    assert.equal((await upload(base, cookie, d.id, "fiets.png", png, "image/png")).status, 201);
    assert.equal((await upload(base, cookie, d.id, "handleiding.pdf", pdf, "application/pdf")).status, 201);
    assert.equal(readdirSync(uploadDir).length, 2);
    assert.equal((await request(base, `/api/devices/${d.id}`, cookie, "DELETE")).status, 204);
    assert.equal(readdirSync(uploadDir).length, 0);
  });
});

test("Wikipedia-API zoekt automatisch op toestel en levert een relevante samenvatting", async () => {
  const requests = [];
  const wikiFetch = async (url, options) => {
    requests.push(url);
    assert.match(url, /^https:\/\/nl\.wikipedia\.org\/w\/api\.php\?/);
    assert.equal(options.headers["User-Agent"].includes("Onderhoudslogboek"), true);
    return {
      ok: true, json: async () => ({
        query: { pages: [{ title: "Fiets", fullurl: "https://nl.wikipedia.org/wiki/Fiets",
          extract: "Een fiets is een voertuig." }] }
      })
    };
  };
  await fixture(async ({ base }) => {
    const a = await account(base, "Alice", "wiki-a@example.org");
    const b = await account(base, "Bob", "wiki-b@example.org");
    const d = await createDevice(base, a, "Stadsfiets");
    const url = `/api/devices/${d.id}/wiki`;
    assert.equal((await request(base, url, b)).status, 404);
    assert.equal(requests.length, 0);
    const response = await request(base, url, a);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, "Wikipedia (MediaWiki API)");
    assert.equal(data.suggestions[0].title, "Fiets");
    assert.equal(data.suggestions[0].summary, "Een fiets is een voertuig.");
    assert.equal(data.suggestions[0].url, "https://nl.wikipedia.org/wiki/Fiets");
    assert.equal(requests.length, 1);
    assert.match(requests[0], /generator=search/);
    assert.match(requests[0], /prop=info%7Cextracts/);
    const added = await json(base, `/api/devices/${d.id}/attachments`, a, "POST",
      { label: "Wikipedia: Fiets", url: data.suggestions[0].url });
    assert.equal(added.status, 201);
    assert.equal((await (await request(base,
      `/api/devices/${d.id}/attachments`, a)).json())[0].label, "Wikipedia: Fiets");
  }, { wikiFetch });
});

test("Bij onbereikbare MediaWiki-API blijft de app werken", async () => {
  await fixture(async ({ base }) => {
    const cookie = await account(base, "Alice", "wikifail@example.org");
    const d = await createDevice(base, cookie, "Fiets");
    const wiki = await request(base, `/api/devices/${d.id}/wiki`, cookie);
    assert.equal(wiki.status, 502);
    assert.match((await wiki.json()).error, /Wikipedia/);
    assert.equal((await request(base, "/api/devices", cookie)).status, 200);
  }, { wikiFetch: async () => { throw new Error("Netwerk offline"); } });
});

test("MediaWiki probeert categorie als een specifiek merk geen resultaat oplevert", async () => {
  const terms = [];
  const wikiFetch = async url => {
    const term = new URL(url).searchParams.get("gsrsearch");
    terms.push(term);
    return { ok: true, json: async () =>
      term === "fiets" ? { query: { pages: [{ title: "Fiets",
        extract: "Fiets als vervoermiddel.", fullurl: "https://nl.wikipedia.org/wiki/Fiets" }] } } :
        { query: { pages: [] } } };
  };
  await fixture(async ({ base }) => {
    const cookie = await account(base, "Alice", "fallback@example.org");
    const d = await createDevice(base, cookie, "Mijn Gazelle");
    const response = await request(base, `/api/devices/${d.id}/wiki`, cookie);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.query, "fiets");
    assert.equal(result.suggestions[0].title, "Fiets");
    assert.deepEqual(terms, ["Gazelle Esprit", "fiets"]);
  }, { wikiFetch });
});
