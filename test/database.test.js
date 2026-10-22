import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addDevice, listDevices, openDatabase } from "../src/database.js";

test("SQLite bewaart toestellen na sluiten en opnieuw openen", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "maintenance-db-"));
  const file = path.join(directory, "nested", "maintenance.sqlite");
  try {
    const first = openDatabase(file);
    const saved = addDevice(first, {
      name: "Stadsfiets", type: "fiets", brand: "Gazelle",
      model: "Esprit", nextMaintenance: "2026-12-01"
    });
    assert.equal(typeof saved.id, "number");
    first.close();

    const reopened = openDatabase(file);
    assert.deepEqual(listDevices(reopened), [saved]);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Een lege database heeft een lege toestellenlijst", () => {
  const db = openDatabase(":memory:");
  assert.deepEqual(listDevices(db), []);
  db.close();
});
