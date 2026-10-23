import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const defaultPath = fileURLToPath(new URL("../data/maintenance.sqlite", import.meta.url));
const fields = "id, name, type, brand, model, next_maintenance AS nextMaintenance, purchase_date AS purchaseDate";

export function openDatabase(filename = process.env.DB_PATH || defaultPath) {
  if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('fiets','voertuig','apparaat','overig')),
      brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      next_maintenance TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('onderhoud','defect','herstelling')),
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0)
    );
  `);
  const columns = db.prepare("PRAGMA table_info(devices)").all().map(column => column.name);
  if (!columns.includes("purchase_date")) {
    db.exec("ALTER TABLE devices ADD COLUMN purchase_date TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.includes("user_id")) {
    db.exec("ALTER TABLE devices ADD COLUMN user_id INTEGER REFERENCES users(id)");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_registrations_device_date ON registrations(device_id, date DESC, id DESC)");
  return db;
}

// De eerste registratie neemt bestaande, nog niet-toegewezen toestellen over.
export function createUser(db, name, email, passwordHash) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const first = db.prepare("SELECT COUNT(*) AS total FROM users").get().total === 0;
    const inserted = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
      .run(name, email, passwordHash);
    const id = Number(inserted.lastInsertRowid);
    if (first) db.prepare("UPDATE devices SET user_id = ? WHERE user_id IS NULL").run(id);
    db.exec("COMMIT");
    return { id, name, email };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function findUserByEmail(db, email) {
  return db.prepare("SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ?")
    .get(email) ?? null;
}
export function createSession(db, digest, userId, expiresAt) {
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(digest, userId, expiresAt);
}
export function sessionUser(db, digest, now) {
  return db.prepare(`SELECT users.id, users.name, users.email FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(digest, now) ?? null;
}
export function deleteSession(db, digest) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest);
}
export function listDevices(db, userId) {
  return db.prepare(`SELECT ${fields} FROM devices WHERE user_id = ? ORDER BY id DESC`).all(userId);
}
export function getDevice(db, userId, id) {
  return db.prepare(`SELECT ${fields} FROM devices WHERE id = ? AND user_id = ?`)
    .get(id, userId) ?? null;
}
export function addDevice(db, userId, device) {
  const result = db.prepare(`INSERT INTO devices
    (name, type, brand, model, next_maintenance, purchase_date, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(device.name, device.type, device.brand,
      device.model, device.nextMaintenance, device.purchaseDate ?? "", userId);
  return getDevice(db, userId, Number(result.lastInsertRowid));
}
export function updateDevice(db, userId, id, device) {
  const result = db.prepare(`UPDATE devices SET name = ?, type = ?, brand = ?,
    model = ?, next_maintenance = ?, purchase_date = ?
    WHERE id = ? AND user_id = ?`).run(device.name, device.type, device.brand,
      device.model, device.nextMaintenance, device.purchaseDate ?? "", id, userId);
  return result.changes ? getDevice(db, userId, id) : null;
}
export function deleteDevice(db, userId, id) {
  return db.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?")
    .run(id, userId).changes > 0;
}

const registrationFields = "id, device_id AS deviceId, type, date, description, cost_cents / 100.0 AS cost";

export function listRegistrations(db, userId, deviceId) {
  return db.prepare(`
    SELECT ${registrationFields}
    FROM registrations
    WHERE device_id = ? AND EXISTS (
      SELECT 1 FROM devices WHERE devices.id = registrations.device_id AND user_id = ?
    )
    ORDER BY date DESC, id DESC
  `).all(deviceId, userId);
}

export function getRegistration(db, userId, deviceId, registrationId) {
  return db.prepare(`
    SELECT ${registrationFields}
    FROM registrations
    WHERE id = ? AND device_id = ? AND EXISTS (
      SELECT 1 FROM devices WHERE devices.id = registrations.device_id AND user_id = ?
    )
  `).get(registrationId, deviceId, userId) ?? null;
}

export function addRegistration(db, userId, deviceId, registration) {
  const result = db.prepare(`
    INSERT INTO registrations (device_id, type, date, description, cost_cents)
    SELECT id, ?, ?, ?, ? FROM devices WHERE id = ? AND user_id = ?
  `).run(registration.type, registration.date, registration.description,
    registration.costCents, deviceId, userId);
  if (!result.changes) return null;
  return getRegistration(db, userId, deviceId, Number(result.lastInsertRowid));
}

export function updateRegistration(db, userId, deviceId, registrationId, registration) {
  const result = db.prepare(`
    UPDATE registrations SET type = ?, date = ?, description = ?, cost_cents = ?
    WHERE id = ? AND device_id = ? AND EXISTS (
      SELECT 1 FROM devices WHERE devices.id = registrations.device_id AND user_id = ?
    )
  `).run(registration.type, registration.date, registration.description,
    registration.costCents, registrationId, deviceId, userId);
  return result.changes ? getRegistration(db, userId, deviceId, registrationId) : null;
}

export function deleteRegistration(db, userId, deviceId, registrationId) {
  return db.prepare(`
    DELETE FROM registrations
    WHERE id = ? AND device_id = ? AND EXISTS (
      SELECT 1 FROM devices WHERE devices.id = registrations.device_id AND user_id = ?
    )
  `).run(registrationId, deviceId, userId).changes > 0;
}
