import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import createApp from "../src/app.js";
import { openDatabase } from "../src/database.js";

async function request(path, options) {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await response.text()
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
}

test("GET / serves the existing frontend", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.contentType, /text\/html/);
  assert.match(response.body, /Onderhoudslogboek/);
});

test("Express serves the CSS and JavaScript files", async () => {
  const css = await request("/styles.css");
  const javascript = await request("/app.js");
  assert.equal(css.status, 200);
  assert.match(css.contentType, /text\/css/);
  assert.equal(javascript.status, 200);
  assert.match(javascript.contentType, /javascript/);
});

test("GET /api/health returns a successful JSON response", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 200);
  assert.match(response.contentType, /application\/json/);
  assert.deepEqual(JSON.parse(response.body), { status: "ok" });
});

test("GET /api/devices starts with an empty list", async () => {
  const response = await request("/api/devices");
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), []);
});

test("POST /api/devices validates input", async () => {
  const response = await request("/api/devices", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", type: "fiets" })
  });
  assert.equal(response.status, 400);
});

test("POST /api/devices writes a device that GET returns", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const created = await fetch(`${base}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stadsfiets", type: "fiets", brand: "Gazelle" })
    });
    assert.equal(created.status, 201);
    const device = await created.json();
    assert.equal(device.name, "Stadsfiets");
    assert.equal(device.nextMaintenance, "");
    const response = await fetch(`${base}/api/devices`);
    assert.deepEqual(await response.json(), [device]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test("Unknown routes return HTTP 404", async () => {
  const response = await request("/does-not-exist");
  assert.equal(response.status, 404);
});


test("PUT en DELETE passen de toestelgegevens via de API aan", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { "Content-Type": "application/json" };
    const create = await fetch(`${base}/api/devices`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Fiets", type: "fiets" })
    });
    const device = await create.json();

    const update = await fetch(`${base}/api/devices/${device.id}`, {
      method: "PUT", headers,
      body: JSON.stringify({
        name: "Racefiets", type: "fiets", brand: "Trek",
        model: "Domane", nextMaintenance: "2026-12-05"
      })
    });
    assert.equal(update.status, 200);
    const updated = await update.json();
    assert.equal(updated.id, device.id);
    assert.equal(updated.name, "Racefiets");
    assert.deepEqual(await (await fetch(`${base}/api/devices`)).json(), [updated]);

    const deleted = await fetch(`${base}/api/devices/${device.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
    assert.equal(deleted.headers.get("content-length"), null);
    assert.deepEqual(await (await fetch(`${base}/api/devices`)).json(), []);
    assert.equal((await fetch(`${base}/api/devices/${device.id}`, { method: "DELETE" })).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test("PUT en DELETE controleren toestel-ID en invoer", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { "Content-Type": "application/json" };
    const validDevice = { name: "Fiets", type: "fiets" };
    const invalidId = await fetch(`${base}/api/devices/abc`, {
      method: "PUT", headers, body: JSON.stringify(validDevice)
    });
    assert.equal(invalidId.status, 400);
    assert.equal((await fetch(`${base}/api/devices/0`, { method: "DELETE" })).status, 400);
    assert.equal((await fetch(`${base}/api/devices/999`, {
      method: "PUT", headers, body: JSON.stringify(validDevice)
    })).status, 404);
    assert.equal((await fetch(`${base}/api/devices/1`, {
      method: "PUT", headers, body: JSON.stringify({ name: "", type: "fiets" })
    })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test("Aankoopdatum wordt via POST en PUT bewaard en gevalideerd", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { "Content-Type": "application/json" };

    const bad = await fetch(`${base}/api/devices`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Fiets", type: "fiets", purchaseDate: "2026-02-30" })
    });
    assert.equal(bad.status, 400);

    const created = await fetch(`${base}/api/devices`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Fiets", type: "fiets", purchaseDate: "2024-06-20" })
    });
    assert.equal(created.status, 201);
    const device = await created.json();
    assert.equal(device.purchaseDate, "2024-06-20");

    const modified = await fetch(`${base}/api/devices/${device.id}`, {
      method: "PUT", headers,
      body: JSON.stringify({ name: "Racefiets", type: "fiets", purchaseDate: "2025-02-14" })
    });
    assert.equal(modified.status, 200);
    assert.equal((await modified.json()).purchaseDate, "2025-02-14");
    assert.equal((await (await fetch(`${base}/api/devices`)).json())[0].purchaseDate, "2025-02-14");
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
