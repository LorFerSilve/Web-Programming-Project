import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import app from "../src/app.js";

async function get(path) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await response.text()
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("GET / serves the existing frontend", async () => {
  const response = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.contentType, /text\/html/);
  assert.match(response.body, /Onderhoudslogboek/);
});

test("Express serves the CSS and JavaScript files", async () => {
  const css = await get("/styles.css");
  const javascript = await get("/app.js");
  assert.equal(css.status, 200);
  assert.match(css.contentType, /text\/css/);
  assert.equal(javascript.status, 200);
  assert.match(javascript.contentType, /javascript/);
});

test("GET /api/health returns a successful JSON response", async () => {
  const response = await get("/api/health");
  assert.equal(response.status, 200);
  assert.match(response.contentType, /application\/json/);
  assert.deepEqual(JSON.parse(response.body), { status: "ok" });
});

test("Unknown routes return HTTP 404", async () => {
  const response = await get("/does-not-exist");
  assert.equal(response.status, 404);
});
