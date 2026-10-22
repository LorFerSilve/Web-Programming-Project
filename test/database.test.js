import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { addDevice, deleteDevice, getDevice, listDevices, openDatabase, updateDevice } from "../src/database.js";

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

test("Meerdere toestellen hebben onafhankelijke gegevens en CRUD-operaties", () => {
  const db = openDatabase(":memory:");
  try {
    const fiets = addDevice(db, {
      name: "Fiets", type: "fiets", brand: "", model: "",
      nextMaintenance: "", purchaseDate: "2025-02-01"
    });
    const koffie = addDevice(db, {
      name: "Koffiemachine", type: "apparaat", brand: "", model: "",
      nextMaintenance: "", purchaseDate: ""
    });
    const printer = addDevice(db, {
      name: "3D-printer", type: "apparaat", brand: "", model: "",
      nextMaintenance: "", purchaseDate: "2026-01-15"
    });

    assert.equal(listDevices(db).length, 3);
    assert.deepEqual(new Set(listDevices(db).map(device => device.id)),
      new Set([fiets.id, koffie.id, printer.id]));

    const updated = updateDevice(db, koffie.id, {
      name: "Espressomachine", type: "apparaat", brand: "De'Longhi",
      model: "", nextMaintenance: "", purchaseDate: "2026-03-10"
    });
    assert.equal(updated.purchaseDate, "2026-03-10");
    assert.deepEqual(listDevices(db).find(device => device.id === fiets.id), fiets);
    assert.deepEqual(listDevices(db).find(device => device.id === printer.id), printer);

    assert.equal(deleteDevice(db, fiets.id), true);
    assert.deepEqual(listDevices(db), [printer, updated]);
  } finally {
    db.close();
  }
});

test("Bestaande SQLite-database krijgt aankoopdatumkolom zonder gegevensverlies", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "maintenance-upgrade-"));
  const file = path.join(directory, "maintenance.sqlite");
  try {
    // Exact het schema van vóór deze uitbreiding.
    const oldDb = new DatabaseSync(file);
    oldDb.exec(`
      CREATE TABLE devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        next_maintenance TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO devices (name, type, brand, model, next_maintenance)
      VALUES ('Bestaande fiets', 'fiets', 'Gazelle', '', '');
    `);
    oldDb.close();

    const upgraded = openDatabase(file);
    const before = listDevices(upgraded);
    assert.equal(before.length, 1);
    assert.equal(before[0].name, "Bestaande fiets");
    assert.equal(before[0].purchaseDate, "");

    const edited = updateDevice(upgraded, before[0].id, {
      name: "Bestaande fiets", type: "fiets", brand: "Gazelle", model: "",
      nextMaintenance: "", purchaseDate: "2024-06-20"
    });
    upgraded.close();

    const reopened = openDatabase(file);
    assert.deepEqual(listDevices(reopened), [edited]);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Een toestel afzonderlijk ophalen geeft de juiste gegevens terug", () => {
  const db = openDatabase(":memory:");
  try {
    const first = addDevice(db, { name: "Fiets", type: "fiets", brand: "Gazelle",
      model: "Esprit", purchaseDate: "2025-03-10", nextMaintenance: "" });
    const second = addDevice(db, { name: "Printer", type: "apparaat", brand: "",
      model: "", purchaseDate: "", nextMaintenance: "" });
    assert.deepEqual(getDevice(db, first.id), first);
    assert.deepEqual(getDevice(db, second.id), second);
    assert.equal(getDevice(db, 999999), null);
    deleteDevice(db, first.id);
    assert.equal(getDevice(db, first.id), null);
  } finally {
    db.close();
  }
});
