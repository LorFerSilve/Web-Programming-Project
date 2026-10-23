import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  openDatabase, createUser, findUserByEmail, createSession, sessionUser,
  deleteSession, listDevices, getDevice, addDevice, updateDevice, deleteDevice,
  addRegistration, getRegistration, listRegistrations, updateRegistration, deleteRegistration
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

const registration = (type, date, description, costCents = null) =>
  ({ type, date, description, costCents });

test("Registraties blijven na heropenen opgeslagen, gesorteerd per datum en toestel", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "logbook-registrations-"));
  const file = path.join(dir, "maintenance.sqlite");
  try {
    const db = openDatabase(file);
    const user = register(db, "registration@example.org");
    const fiets = addDevice(db, user.id, details("Fiets"));
    const auto = addDevice(db, user.id, details("Auto"));
    const r1 = addRegistration(db, user.id, fiets.id,
      registration("onderhoud", "2026-02-01", "Ketting gesmeerd", 1250));
    const r2 = addRegistration(db, user.id, fiets.id,
      registration("defect", "2026-03-01", "Lekke band"));
    const r3 = addRegistration(db, user.id, auto.id,
      registration("herstelling", "2026-02-02", "Nieuwe batterij", 15000));
    assert.equal(r1.cost, 12.5);
    assert.equal(r2.cost, null);
    assert.equal(r3.cost, 150);
    assert.deepEqual(listRegistrations(db, user.id, fiets.id), [r2, r1]);
    assert.deepEqual(listRegistrations(db, user.id, auto.id), [r3]);
    db.close();
    const reopened = openDatabase(file);
    assert.deepEqual(listRegistrations(reopened, user.id, fiets.id), [r2, r1]);
    assert.deepEqual(listRegistrations(reopened, user.id, auto.id), [r3]);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Registraties kunnen alleen binnen hun eigen toestel en eigenaar worden bewerkt", () => {
  const db = openDatabase(":memory:");
  try {
    const alice = register(db, "registration-alice@example.org");
    const bob = register(db, "registration-bob@example.org");
    const first = addDevice(db, alice.id, details("Fiets"));
    const second = addDevice(db, alice.id, details("Auto"));
    const foreign = addDevice(db, bob.id, details("Printer"));
    const record = addRegistration(db, alice.id, first.id,
      registration("onderhoud", "2026-05-01", "Schoongemaakt", 0));
    assert.equal(record.cost, 0);
    assert.equal(addRegistration(db, bob.id, first.id,
      registration("defect", "2026-05-02", "Onterecht")), null);
    assert.deepEqual(listRegistrations(db, bob.id, first.id), []);
    assert.equal(getRegistration(db, bob.id, first.id, record.id), null);
    assert.equal(getRegistration(db, alice.id, second.id, record.id), null);
    assert.equal(updateRegistration(db, bob.id, first.id, record.id,
      registration("defect", "2026-05-02", "Onterecht")), null);
    assert.equal(updateRegistration(db, alice.id, second.id, record.id,
      registration("defect", "2026-05-02", "Onterecht")), null);
    assert.equal(deleteRegistration(db, bob.id, first.id, record.id), false);
    assert.equal(deleteRegistration(db, alice.id, second.id, record.id), false);
    const edited = updateRegistration(db, alice.id, first.id, record.id,
      registration("herstelling", "2026-05-04", "Opgelost", null));
    assert.equal(edited.type, "herstelling");
    assert.equal(edited.cost, null);
    assert.deepEqual(listRegistrations(db, alice.id, first.id), [edited]);
    assert.deepEqual(listRegistrations(db, bob.id, foreign.id), []);
    assert.equal(deleteRegistration(db, alice.id, first.id, record.id), true);
    assert.equal(deleteRegistration(db, alice.id, first.id, record.id), false);
    assert.deepEqual(listRegistrations(db, alice.id, first.id), []);
  } finally { db.close(); }
});

test("Bij het verwijderen van een toestel verdwijnen zijn registraties automatisch", () => {
  const db = openDatabase(":memory:");
  try {
    const user = register(db, "cascade@example.org");
    const first = addDevice(db, user.id, details("Fiets"));
    const second = addDevice(db, user.id, details("Scooter"));
    const recordOne = addRegistration(db, user.id, first.id,
      registration("onderhoud", "2026-06-01", "Ketting"));
    const recordTwo = addRegistration(db, user.id, second.id,
      registration("defect", "2026-06-02", "Remmen"));
    assert.equal(deleteDevice(db, user.id, first.id), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE id = ?").get(recordOne.id).count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE id = ?").get(recordTwo.id).count, 1);
    assert.deepEqual(listRegistrations(db, user.id, second.id), [recordTwo]);
  } finally { db.close(); }
});
