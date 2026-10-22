import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const defaultPath = fileURLToPath(new URL("../data/maintenance.sqlite", import.meta.url));

export function openDatabase(filename = process.env.DB_PATH || defaultPath) {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('fiets', 'voertuig', 'apparaat', 'overig')),
      brand TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      next_maintenance TEXT NOT NULL DEFAULT ''
    )
  `);
  return db;
}

export function listDevices(db) {
  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance
    FROM devices ORDER BY id DESC
  `).all();
}

export function addDevice(db, device) {
  const result = db.prepare(`
    INSERT INTO devices (name, type, brand, model, next_maintenance)
    VALUES (?, ?, ?, ?, ?)
  `).run(device.name, device.type, device.brand, device.model, device.nextMaintenance);

  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance
    FROM devices WHERE id = ?
  `).get(result.lastInsertRowid);
}

export function updateDevice(db, id, device) {
  const result = db.prepare(`
    UPDATE devices
    SET name = ?, type = ?, brand = ?, model = ?, next_maintenance = ?
    WHERE id = ?
  `).run(device.name, device.type, device.brand, device.model, device.nextMaintenance, id);

  if (result.changes === 0) return null;
  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance
    FROM devices WHERE id = ?
  `).get(id);
}

export function deleteDevice(db, id) {
  return db.prepare("DELETE FROM devices WHERE id = ?").run(id).changes > 0;
}
