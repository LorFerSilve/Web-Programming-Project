import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  openDatabase, createUser, findUserByEmail, createSession, sessionUser,
  deleteSession, listDevices, getDevice, addDevice, updateDevice, deleteDevice
} from "../src/database.js";

const details = name => ({ name, type: "fiets", brand: "Gazelle",
  model: "", nextMaintenance: "", purchaseDate: "2025-03-10" });
const register = (db, email) => createUser(db, email, email, "hashed-password");

test("Nieuwe gebruikers beginnen met een lege toestellenlijst", () => {
  const db = openDatabase(":memory:");
  try {
    const a = register(db, "a@example.org"), b = register(db, "b@example.org");
    assert.deepEqual(listDevices(db, a.id), []);
    assert.deepEqual(listDevices(db, b.id), []);
    assert.equal(findUserByEmail(db, "A@EXAMPLE.ORG").id, a.id);
  } finally { db.close(); }
});

test("Meerdere toestellen blijven aan de juiste gebruiker gekoppeld", () => {
  const db = openDatabase(":memory:");
  try {
    const a = register(db, "a@example.org"), b = register(db, "b@example.org");
    const one = addDevice(db, a.id, details("Fiets"));
    const two = addDevice(db, a.id, details("Scooter"));
    const other = addDevice(db, b.id, details("Printer"));
    assert.deepEqual(listDevices(db, a.id), [two, one]);
    assert.deepEqual(listDevices(db, b.id), [other]);
    assert.deepEqual(getDevice(db, a.id, one.id), one);
    assert.equal(getDevice(db, b.id, one.id), null);
    assert.equal(updateDevice(db, b.id, one.id, details("Hacked")), null);
    assert.equal(deleteDevice(db, b.id, one.id), false);
    assert.equal(updateDevice(db, a.id, one.id, details("Racefiets")).name, "Racefiets");
    assert.equal(deleteDevice(db, a.id, two.id), true);
    assert.deepEqual(listDevices(db, b.id), [other]);
  } finally { db.close(); }
});

test("Toestellen en sessies blijven na heropenen bewaard", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-auth-"));
  const file = path.join(dir, "maintenance.sqlite");
  try {
    const db = openDatabase(file);
    const a = register(db, "a@example.org");
    const saved = addDevice(db, a.id, details("Fiets"));
    createSession(db, "test-digest", a.id, Date.now() + 60000);
    db.close();
    const reopened = openDatabase(file);
    assert.deepEqual(listDevices(reopened, a.id), [saved]);
    assert.equal(sessionUser(reopened, "test-digest", Date.now()).id, a.id);
    assert.equal(sessionUser(reopened, "test-digest", Date.now() + 999999), null);
    deleteSession(reopened, "test-digest");
    assert.equal(sessionUser(reopened, "test-digest", Date.now()), null);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Historische toestellen zonder aankoopdatum gaan naar het eerste account", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-migration-"));
  const file = path.join(dir, "maintenance.sqlite");
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      next_maintenance TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO devices (name, type) VALUES ('Oude fiets', 'fiets');`);
    old.close();
    const db = openDatabase(file);
    const a = register(db, "a@example.org");
    assert.equal(listDevices(db, a.id)[0].name, "Oude fiets");
    assert.equal(listDevices(db, a.id)[0].purchaseDate, "");
    const b = register(db, "b@example.org");
    assert.deepEqual(listDevices(db, b.id), []);
    db.close();
    const reopened = openDatabase(file);
    assert.equal(listDevices(reopened, a.id)[0].name, "Oude fiets");
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Historische toestellen met aankoopdatum behouden die datum", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-v2-"));
  const file = path.join(dir, "maintenance.sqlite");
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      next_maintenance TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL DEFAULT ''
    ); INSERT INTO devices (name, type, purchase_date)
    VALUES ('Toestel', 'apparaat', '2024-05-05');`);
    old.close();
    const db = openDatabase(file);
    const a = register(db, "a@example.org");
    assert.equal(listDevices(db, a.id)[0].purchaseDate, "2024-05-05");
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("E-mailadressen zijn case-insensitief uniek", () => {
  const db = openDatabase(":memory:");
  try {
    register(db, "hello@example.org");
    assert.throws(() => register(db, "HELLO@example.org"), /UNIQUE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 1);
  } finally { db.close(); }
});
