import express from "express";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  addDevice, createSession, createUser, deleteDevice, deleteSession,
  findUserByEmail, getDevice, sessionUser, listDevices, updateDevice,
  addRegistration, listRegistrations, getRegistration, updateRegistration, deleteRegistration
} from "./database.js";

const scrypt = promisify(scryptCallback);
const categories = new Set(["fiets", "voertuig", "apparaat", "overig"]);
const sessionDays = 7;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

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
      !categories.has(type) || typeof brand !== "string" || brand.length > 70 ||
      typeof model !== "string" || model.length > 70 ||
      typeof nextMaintenance !== "string" || !validDate(nextMaintenance) ||
      typeof purchaseDate !== "string" || !validDate(purchaseDate)) return null;
  return { name: name.trim(), type, brand: brand.trim(), model: model.trim(), nextMaintenance, purchaseDate };
}
const registrationTypes = new Set(["onderhoud", "defect", "herstelling"]);

function parseRegistration(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { type, date, description, cost = null } = body;
  if (!registrationTypes.has(type) || typeof date !== "string" ||
      date === "" || !validDate(date) ||
      typeof description !== "string" || !description.trim() ||
      description.trim().length > 2000) return null;
  if (cost !== null && (typeof cost !== "number" || !Number.isFinite(cost) ||
      cost < 0 || cost > 1000000 ||
      Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001)) return null;
  return { type, date, description: description.trim(),
    costCents: cost === null ? null : Math.round(cost * 100) };
}

function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function parseCredentials(body, register = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { name, email, password } = body;
  if (typeof email !== "string" || typeof password !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      password.length > 128) return null;
  if (register && (typeof name !== "string" || !name.trim() ||
      name.trim().length > 70 || password.length < 10)) return null;
  return { name: register ? name.trim() : "", email: normalized, password };
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [salt, hash] = typeof stored === "string" ? stored.split(":") : [];
  const validSalt = !!salt && /^[a-f0-9]{32}$/.test(salt);
  const validHash = !!hash && /^[a-f0-9]{128}$/.test(hash);
  const actual = await scrypt(password, validSalt ? salt : "00000000000000000000000000000000", 64);
  const expected = validHash ? Buffer.from(hash, "hex") : Buffer.alloc(64);
  return validSalt && validHash && timingSafeEqual(actual, expected);
}
function digest(token) { return createHash("sha256").update(token).digest("hex"); }
function cookieToken(request) {
  const cookie = (request.headers.cookie || "").split(";").map(x => x.trim())
    .find(x => x.startsWith("session="));
  const token = cookie?.slice(8);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function cookieOptions(request) {
  return { httpOnly: true, sameSite: "lax", secure: request.secure,
    path: "/", maxAge: sessionDays * 86400000 };
}
function signIn(db, request, response, user) {
  const token = randomBytes(32).toString("hex");
  createSession(db, digest(token), user.id, Date.now() + sessionDays * 86400000);
  response.cookie("session", token, cookieOptions(request));
  return response.json({ user });
}
function needLogin(request, response, next) {
  if (!request.user) return response.status(401).json({ error: "Log eerst in." });
  next();
}

export default function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  // SameSite-cookie en Origin-controle beperken cross-site schrijfacties.
  app.use("/api", (request, response, next) => {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method) &&
        request.headers.origin &&
        request.headers.origin !== `${request.protocol}://${request.get("host")}`) {
      return response.status(403).json({ error: "Ongeldige herkomst." });
    }
    next();
  });
  app.use((request, response, next) => {
    const token = cookieToken(request);
    request.sessionDigest = token ? digest(token) : null;
    request.user = request.sessionDigest ?
      sessionUser(db, request.sessionDigest, Date.now()) : null;
    next();
  });

  app.get("/api/health", (request, response) => response.json({ status: "ok" }));

  app.post("/api/auth/register", async (request, response) => {
    const data = parseCredentials(request.body, true);
    if (!data) return response.status(400).json({
      error: "Vul een naam, geldig e-mailadres en wachtwoord van minstens 10 tekens in."
    });
    const passwordHash = await hashPassword(data.password);
    try {
      const user = createUser(db, data.name, data.email, passwordHash);
      return signIn(db, request, response, user);
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(error.message)) {
        return response.status(409).json({ error: "Er bestaat al een account met dit e-mailadres." });
      }
      throw error;
    }
  });
  app.post("/api/auth/login", async (request, response) => {
    const data = parseCredentials(request.body);
    if (!data) return response.status(400).json({ error: "Ongeldige inloggegevens." });
    const user = findUserByEmail(db, data.email);
    if (!await verifyPassword(data.password, user?.passwordHash)) {
      return response.status(401).json({ error: "E-mailadres of wachtwoord is onjuist." });
    }
    return signIn(db, request, response, { id: user.id, name: user.name, email: user.email });
  });
  app.get("/api/auth/me", needLogin, (request, response) => response.json({ user: request.user }));
  app.post("/api/auth/logout", (request, response) => {
    if (request.sessionDigest) deleteSession(db, request.sessionDigest);
    response.clearCookie("session", { path: "/", sameSite: "lax",
      secure: request.secure, httpOnly: true });
    return response.sendStatus(204);
  });

  app.get("/login", (request, response) => {
    if (request.user) return response.redirect("/");
    return response.sendFile(fileURLToPath(new URL("../public/login.html", import.meta.url)));
  });
  app.get("/", (request, response) => {
    if (!request.user) return response.redirect("/login");
    return response.sendFile(fileURLToPath(new URL("../public/index.html", import.meta.url)));
  });
  app.get(["/index.html", "/device.html"], (request, response) => response.redirect("/"));
  app.use("/api/devices", needLogin);
  app.get("/api/devices", (request, response) => response.json(listDevices(db, request.user.id)));
  app.get("/api/devices/:id", (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    const device = getDevice(db, request.user.id, id);
    if (!device) return response.status(404).json({ error: "Toestel niet gevonden." });
    return response.json(device);
  });
  app.post("/api/devices", (request, response) => {
    const device = parseDevice(request.body);
    if (!device) return response.status(400).json({ error: "Ongeldige toestelgegevens." });
    return response.status(201).json(addDevice(db, request.user.id, device));
  });
  app.put("/api/devices/:id", (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    const device = parseDevice(request.body);
    if (!device) return response.status(400).json({ error: "Ongeldige toestelgegevens." });
    const updated = updateDevice(db, request.user.id, id, device);
    if (!updated) return response.status(404).json({ error: "Toestel niet gevonden." });
    return response.json(updated);
  });
  app.delete("/api/devices/:id", (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    if (!deleteDevice(db, request.user.id, id)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    return response.sendStatus(204);
  });
  app.get("/api/devices/:id/registrations", (request, response) => {
    const deviceId = parseId(request.params.id);
    if (deviceId === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    if (!getDevice(db, request.user.id, deviceId)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    return response.json(listRegistrations(db, request.user.id, deviceId));
  });

  app.post("/api/devices/:id/registrations", (request, response) => {
    const deviceId = parseId(request.params.id);
    if (deviceId === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    if (!getDevice(db, request.user.id, deviceId)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    const registration = parseRegistration(request.body);
    if (!registration) return response.status(400).json({ error: "Ongeldige registratiegegevens." });
    return response.status(201).json(addRegistration(db, request.user.id, deviceId, registration));
  });

  app.put("/api/devices/:id/registrations/:registrationId", (request, response) => {
    const deviceId = parseId(request.params.id);
    const registrationId = parseId(request.params.registrationId);
    if (deviceId === null || registrationId === null) {
      return response.status(400).json({ error: "Ongeldig toestel- of registratie-ID." });
    }
    if (!getDevice(db, request.user.id, deviceId)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    const registration = parseRegistration(request.body);
    if (!registration) return response.status(400).json({ error: "Ongeldige registratiegegevens." });
    const updated = updateRegistration(db, request.user.id, deviceId, registrationId, registration);
    if (!updated) return response.status(404).json({ error: "Registratie niet gevonden." });
    return response.json(updated);
  });

  app.delete("/api/devices/:id/registrations/:registrationId", (request, response) => {
    const deviceId = parseId(request.params.id);
    const registrationId = parseId(request.params.registrationId);
    if (deviceId === null || registrationId === null) {
      return response.status(400).json({ error: "Ongeldig toestel- of registratie-ID." });
    }
    if (!deleteRegistration(db, request.user.id, deviceId, registrationId)) {
      return response.status(404).json({ error: "Registratie niet gevonden." });
    }
    return response.sendStatus(204);
  });

  app.get("/devices/:id", (request, response) => {
    if (!request.user) return response.redirect("/login");
    const id = parseId(request.params.id);
    if (id === null || !getDevice(db, request.user.id, id)) {
      return response.status(404).send("Toestel niet gevonden.");
    }
    return response.sendFile(fileURLToPath(new URL("../public/device.html", import.meta.url)));
  });

  app.use(express.static(publicDir, { index: false }));
  return app;
}
