import express from "express";
import { fileURLToPath } from "node:url";
import { addDevice, deleteDevice, listDevices, updateDevice } from "./database.js";

const deviceTypes = new Set(["fiets", "voertuig", "apparaat", "overig"]);

function validDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseDevice(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { name, type, brand = "", model = "", nextMaintenance = "", purchaseDate = "" } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 70 ||
      !deviceTypes.has(type) || typeof brand !== "string" || brand.length > 70 ||
      typeof model !== "string" || model.length > 70 ||
      typeof nextMaintenance !== "string" || !validDate(nextMaintenance) ||
      typeof purchaseDate !== "string" || !validDate(purchaseDate)) return null;
  return { name: name.trim(), type, brand: brand.trim(), model: model.trim(), nextMaintenance, purchaseDate };
}

function parseId(value) {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/devices", (request, response) => {
    response.json(listDevices(db));
  });

  app.post("/api/devices", (request, response) => {
    const device = parseDevice(request.body);
    if (!device) {
      return response.status(400).json({ error: "Ongeldige toestelgegevens." });
    }
    return response.status(201).json(addDevice(db, device));
  });

  app.put("/api/devices/:id", (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    const device = parseDevice(request.body);
    if (!device) return response.status(400).json({ error: "Ongeldige toestelgegevens." });
    const updated = updateDevice(db, id, device);
    if (!updated) return response.status(404).json({ error: "Toestel niet gevonden." });
    return response.json(updated);
  });

  app.delete("/api/devices/:id", (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    if (!deleteDevice(db, id)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    return response.sendStatus(204);
  });

  app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))));
  return app;
}
