import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addDevice, deleteDevice, listDevices, openDatabase, updateDevice } from "../src/database.js";

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


test("Toestellen aanpassen en verwijderen blijft bewaard na heropenen", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "maintenance-crud-"));
  const file = path.join(directory, "maintenance.sqlite");
  try {
    const db = openDatabase(file);
    const inserted = addDevice(db, {
      name: "Stadsfiets", type: "fiets", brand: "Gazelle",
      model: "", nextMaintenance: ""
    });
    const updated = updateDevice(db, inserted.id, {
      name: "Racefiets", type: "fiets", brand: "Trek",
      model: "Domane", nextMaintenance: "2026-12-05"
    });
    assert.equal(updated.name, "Racefiets");
    assert.equal(updated.id, inserted.id);
    assert.equal(updateDevice(db, 99999, {
      name: "Niet bestaand", type: "fiets", brand: "", model: "", nextMaintenance: ""
    }), null);
    db.close();

    const reopened = openDatabase(file);
    assert.deepEqual(listDevices(reopened), [updated]);
    assert.equal(deleteDevice(reopened, updated.id), true);
    assert.equal(deleteDevice(reopened, updated.id), false);
    reopened.close();

    const again = openDatabase(file);
    assert.deepEqual(listDevices(again), []);
    again.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
