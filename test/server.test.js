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
