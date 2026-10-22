import express from "express";
import { fileURLToPath } from "node:url";
import { addDevice, listDevices } from "./database.js";

const deviceTypes = new Set(["fiets", "voertuig", "apparaat", "overig"]);

function validDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseDevice(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { name, type, brand = "", model = "", nextMaintenance = "" } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 70 ||
      !deviceTypes.has(type) || typeof brand !== "string" || brand.length > 70 ||
      typeof model !== "string" || model.length > 70 ||
      typeof nextMaintenance !== "string" || !validDate(nextMaintenance)) return null;
  return { name: name.trim(), type, brand: brand.trim(), model: model.trim(), nextMaintenance };
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

  app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))));
  return app;
}
