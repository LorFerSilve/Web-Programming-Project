import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import createApp from "../src/app.js";
import { openDatabase } from "../src/database.js";

async function serverTest(fn) {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
}
const device = name => ({
  name, type: "fiets", brand: "Gazelle", model: "Esprit",
  nextMaintenance: "2026-12-01", purchaseDate: "2025-04-18"
});
async function req(base, path, method = "GET", cookie, body, extra = {}) {
  return fetch(base + path, {
    method, redirect: "manual",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extra
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
async function register(base, name, email) {
  const r = await req(base, "/api/auth/register", "POST", null,
    { name, email, password: "veilig-wachtwoord-123" });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const user = (await r.json()).user;
  assert.equal(Object.hasOwn(user, "passwordHash"), false);
  return cookie.split(";")[0];
}

test("Zonder login worden homepage en alle toestelroutes afgeschermd", () => serverTest(async base => {
  assert.equal((await req(base, "/")).status, 302);
  assert.equal((await req(base, "/devices/1")).status, 302);
  assert.equal((await req(base, "/api/devices")).status, 401);
  assert.equal((await req(base, "/api/devices/1")).status, 401);
  assert.equal((await req(base, "/api/devices", "POST", null, device("Fiets"))).status, 401);
  assert.equal((await req(base, "/api/devices/1", "PUT", null, device("Fiets"))).status, 401);
  assert.equal((await req(base, "/api/devices/1", "DELETE")).status, 401);
  assert.equal((await req(base, "/api/auth/me")).status, 401);
}));

test("Loginpagina, statische bestanden, health en 404 werken", () => serverTest(async base => {
  assert.equal((await req(base, "/login")).status, 200);
  for (const file of ["/styles.css", "/app.js", "/device.js", "/login.js", "/auth-client.js"]) {
    assert.equal((await req(base, file)).status, 200);
  }
  assert.deepEqual(await (await req(base, "/api/health")).json(), { status: "ok" });
  assert.equal((await req(base, "/index.html")).status, 302);
  assert.equal((await req(base, "/does-not-exist")).status, 404);
}));

test("Registratie valideert invoer en blokkeert dubbele e-mails", () => serverTest(async base => {
  assert.equal((await req(base, "/api/auth/register", "POST", null,
    { name: "A", email: "a@example.org", password: "kort" })).status, 400);
  const cookie = await register(base, "Alice", "alice@example.org");
  assert.equal((await req(base, "/api/auth/me", "GET", cookie)).status, 200);
  assert.equal((await req(base, "/api/auth/register", "POST", null,
    { name: "A", email: "ALICE@example.org", password: "veilig-wachtwoord-123" })).status, 409);
}));

test("Inloggen, onjuist wachtwoord en uitloggen werken", () => serverTest(async base => {
  const first = await register(base, "Alice", "alice@example.org");
  assert.equal((await req(base, "/api/auth/login", "POST", null,
    { email: "alice@example.org", password: "fout" })).status, 401);
  const r = await req(base, "/api/auth/login", "POST", null,
    { email: "ALICE@example.org", password: "veilig-wachtwoord-123" });
  assert.equal(r.status, 200);
  const second = r.headers.get("set-cookie").split(";")[0];
  assert.equal((await req(base, "/api/auth/me", "GET", second)).status, 200);
  assert.equal((await req(base, "/api/auth/logout", "POST", second)).status, 204);
  assert.equal((await req(base, "/api/auth/me", "GET", second)).status, 401);
  assert.equal((await req(base, "/api/auth/me", "GET", first)).status, 200);
}));

test("Eigen toestellen toevoegen, lezen, bewerken en verwijderen", () => serverTest(async base => {
  const cookie = await register(base, "Alice", "alice@example.org");
  const created = await req(base, "/api/devices", "POST", cookie, device("Stadsfiets"));
  assert.equal(created.status, 201);
  const saved = await created.json();
  assert.equal(saved.purchaseDate, "2025-04-18");
  assert.deepEqual(await (await req(base, "/api/devices", "GET", cookie)).json(), [saved]);
  assert.deepEqual(await (await req(base, `/api/devices/${saved.id}`, "GET", cookie)).json(), saved);
  assert.equal((await req(base, `/devices/${saved.id}`, "GET", cookie)).status, 200);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "PUT", cookie, device("Racefiets"))).status, 200);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "DELETE", cookie)).status, 204);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "GET", cookie)).status, 404);
  assert.equal((await req(base, `/devices/${saved.id}`, "GET", cookie)).status, 404);
}));

test("Gebruiker B kan geen toestellen van A benaderen, ook niet via ID", () => serverTest(async base => {
  const a = await register(base, "Alice", "alice@example.org");
  const b = await register(base, "Bob", "bob@example.org");
  const saved = await (await req(base, "/api/devices", "POST", a, device("Privéfiets"))).json();
  assert.deepEqual(await (await req(base, "/api/devices", "GET", b)).json(), []);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "GET", b)).status, 404);
  assert.equal((await req(base, `/devices/${saved.id}`, "GET", b)).status, 404);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "PUT", b, device("Hack"))).status, 404);
  assert.equal((await req(base, `/api/devices/${saved.id}`, "DELETE", b)).status, 404);
  assert.equal((await (await req(base, `/api/devices/${saved.id}`, "GET", a)).json()).name, "Privéfiets");
  const own = await (await req(base, "/api/devices", "POST", b, device("Fiets Bob"))).json();
  assert.equal((await req(base, `/api/devices/${own.id}`, "GET", a)).status, 404);
  assert.equal((await (await req(base, "/api/devices", "GET", b)).json()).length, 1);
}));

test("Ongeldige ID, invoer en cross-origin schrijfacties worden geweigerd", () => serverTest(async base => {
  const cookie = await register(base, "Alice", "alice@example.org");
  assert.equal((await req(base, "/api/devices/abc", "GET", cookie)).status, 400);
  assert.equal((await req(base, "/api/devices/0", "DELETE", cookie)).status, 400);
  assert.equal((await req(base, "/api/devices/999", "PUT", cookie, device("Fiets"))).status, 404);
  assert.equal((await req(base, "/api/devices", "POST", cookie,
    { ...device("Fiets"), purchaseDate: "2026-02-30" })).status, 400);
  assert.equal((await req(base, "/api/devices", "POST", cookie, device("Fiets"),
    { Origin: "https://evil.example" })).status, 403);
  assert.equal((await req(base, "/api/devices", "POST", cookie, device("Fiets"),
    { Origin: base })).status, 201);
}));
