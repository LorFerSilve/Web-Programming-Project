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
      next_maintenance TEXT NOT NULL DEFAULT '',
      purchase_date TEXT NOT NULL DEFAULT ''
    )
  `);

  // Oude databases (ook in bestaande Docker-volumes) behouden hun gegevens.
  const columns = db.prepare("PRAGMA table_info(devices)").all();
  if (!columns.some(column => column.name === "purchase_date")) {
    db.exec("ALTER TABLE devices ADD COLUMN purchase_date TEXT NOT NULL DEFAULT ''");
  }
  return db;
}

export function listDevices(db) {
  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance, purchase_date AS purchaseDate
    FROM devices ORDER BY id DESC
  `).all();
}

export function addDevice(db, device) {
  const result = db.prepare(`
    INSERT INTO devices (name, type, brand, model, next_maintenance, purchase_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(device.name, device.type, device.brand, device.model, device.nextMaintenance, device.purchaseDate ?? "");

  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance, purchase_date AS purchaseDate
    FROM devices WHERE id = ?
  `).get(result.lastInsertRowid);
}

export function updateDevice(db, id, device) {
  const result = db.prepare(`
    UPDATE devices
    SET name = ?, type = ?, brand = ?, model = ?, next_maintenance = ?, purchase_date = ?
    WHERE id = ?
  `).run(device.name, device.type, device.brand, device.model, device.nextMaintenance, device.purchaseDate ?? "", id);

  if (result.changes === 0) return null;
  return db.prepare(`
    SELECT id, name, type, brand, model, next_maintenance AS nextMaintenance, purchase_date AS purchaseDate
    FROM devices WHERE id = ?
  `).get(id);
}

export function deleteDevice(db, id) {
  return db.prepare("DELETE FROM devices WHERE id = ?").run(id).changes > 0;
}
