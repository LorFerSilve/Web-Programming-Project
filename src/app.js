import express from "express";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  addDevice, createSession, createUser, deleteDevice, deleteSession,
  findUserByEmail, getDevice, sessionUser, listDevices, updateDevice,
  addRegistration, listRegistrations, getRegistration, updateRegistration, deleteRegistration,
  listAttachments, getAttachment, addAttachment, deleteAttachment, attachmentFiles
} from "./database.js";

const scrypt = promisify(scryptCallback);
const categories = new Set(["fiets", "voertuig", "apparaat", "overig"]);
const sessionDays = 7;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const defaultUploadDir = fileURLToPath(new URL("../data/uploads/", import.meta.url));
const maxUploadBytes = 5 * 1024 * 1024;

function validDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function parseDevice(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { name, type, brand = "", model = "", nextMaintenance = "", purchaseDate = "", notes = "" } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 70 ||
      !categories.has(type) || typeof brand !== "string" || brand.length > 70 ||
      typeof model !== "string" || model.length > 70 ||
      typeof nextMaintenance !== "string" || !validDate(nextMaintenance) ||
      typeof purchaseDate !== "string" || !validDate(purchaseDate) ||
      typeof notes !== "string" || notes.length > 5000) return null;
  return { name: name.trim(), type, brand: brand.trim(), model: model.trim(), nextMaintenance, purchaseDate, notes };
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

function attachmentScope(req, res) {
  const deviceId = parseId(req.params.id);
  if (deviceId === null) { res.status(400).json({ error: "Ongeldig toestel-ID." }); return null; }
  if (!getDevice(req.app.locals.db, req.user.id, deviceId)) {
    res.status(404).json({ error: "Toestel niet gevonden." }); return null;
  }
  return deviceId;
}
function parseRegistrationTarget(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseId(String(value));
}
function parseWebLink(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
function fileType(buffer, declared) {
  const types = {
    "image/jpeg": { ext: ".jpg", kind: "photo" },
    "image/png": { ext: ".png", kind: "photo" },
    "image/webp": { ext: ".webp", kind: "photo" },
    "application/pdf": { ext: ".pdf", kind: "document" }
  };
  const config = types[declared];
  if (!config) return null;
  const isJpeg = buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const isPng = buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp = buffer.length >= 12 && buffer.toString("ascii",0,4) === "RIFF" &&
    buffer.toString("ascii",8,12) === "WEBP";
  const isPdf = buffer.length >= 5 && buffer.toString("ascii",0,5) === "%PDF-";
  if (!(declared === "image/jpeg" && isJpeg ||
        declared === "image/png" && isPng ||
        declared === "image/webp" && isWebp ||
        declared === "application/pdf" && isPdf)) return null;
  return { ...config, mimeType: declared };
}
function safeFilename(value) {
  if (typeof value !== "string" || value.length > 450) return null;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  const name = decoded.replace(/[\\/]/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim();
  return name && name.length <= 120 ? name : null;
}
function headerAttachmentName(name) {
  return `attachment; filename="bestand"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
export default function createApp(db, options = {}) {
  const app = express();
  app.locals.db = db;
  const uploadDir = options.uploadDir || process.env.UPLOAD_DIR ||
    (process.env.DB_PATH ? path.join(path.dirname(path.resolve(process.env.DB_PATH)), "uploads") : defaultUploadDir);
  const wikiFetch = options.wikiFetch || fetch;
  async function removeFiles(files) {
    for (const file of files) {
      if (file.storedName) {
        try { await unlink(path.join(uploadDir, file.storedName)); }
        catch (error) { if (error.code !== "ENOENT") console.error("Bijlage opruimen:", error); }
      }
    }
  }
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
  app.delete("/api/devices/:id", async (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) return response.status(400).json({ error: "Ongeldig toestel-ID." });
    const files = attachmentFiles(db, request.user.id, id);
    if (!deleteDevice(db, request.user.id, id)) {
      return response.status(404).json({ error: "Toestel niet gevonden." });
    }
    await removeFiles(files);
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

  app.delete("/api/devices/:id/registrations/:registrationId", async (request, response) => {
    const deviceId = parseId(request.params.id);
    const registrationId = parseId(request.params.registrationId);
    if (deviceId === null || registrationId === null) {
      return response.status(400).json({ error: "Ongeldig toestel- of registratie-ID." });
    }
    const files = attachmentFiles(db, request.user.id, deviceId, registrationId);
    if (!deleteRegistration(db, request.user.id, deviceId, registrationId)) {
      return response.status(404).json({ error: "Registratie niet gevonden." });
    }
    await removeFiles(files);
    return response.sendStatus(204);
  });

  // Bijlagen: foto's/PDF's worden als ruwe bytes verstuurd; links als JSON.
  app.get("/api/devices/:id/attachments", (request, response) => {
    const id = attachmentScope(request, response);
    if (id === null) return;
    return response.json(listAttachments(db, request.user.id, id));
  });
  app.post("/api/devices/:id/attachments", (request, response) => {
    const id = attachmentScope(request, response);
    if (id === null) return;
    const { label, url, registrationId } = request.body ?? {};
    const target = parseRegistrationTarget(registrationId);
    const link = parseWebLink(url);
    if (!link || typeof label !== "string" || !label.trim() || label.trim().length > 120 ||
        (registrationId != null && registrationId !== "" && target === null)) {
      return response.status(400).json({ error: "Ongeldige link of titel." });
    }
    const saved = addAttachment(db, request.user.id, id, {
      kind: "link", label: label.trim(), url: link, registrationId: target
    });
    if (!saved) return response.status(400).json({ error: "Registratie hoort niet bij dit toestel." });
    delete saved.storedName;
    return response.status(201).json(saved);
  });
  app.post("/api/devices/:id/attachments/file",
    express.raw({ type: () => true, limit: "5mb" }), async (request, response) => {
      const id = attachmentScope(request, response);
      if (id === null) return;
      const rawTarget = request.query.registrationId;
      const target = parseRegistrationTarget(rawTarget);
      if ((rawTarget !== undefined && rawTarget !== "" && target === null) ||
          !Buffer.isBuffer(request.body) || request.body.length === 0 ||
          request.body.length > maxUploadBytes) {
        return response.status(400).json({ error: "Ongeldig bestand of registratie-ID." });
      }
      const kind = fileType(request.body, request.get("content-type")?.split(";")[0].trim().toLowerCase());
      const filename = safeFilename(request.get("x-filename"));
      if (!kind || !filename) {
        return response.status(400).json({ error: "Alleen JPEG-, PNG-, WebP-foto's en PDF-bestanden zijn toegestaan." });
      }
      // Controleren vóór schrijven: geen bestanden zonder geldige koppeling.
      if (target !== null && !getRegistration(db, request.user.id, id, target)) {
        return response.status(400).json({ error: "Registratie hoort niet bij dit toestel." });
      }
      const storedName = randomUUID() + kind.ext;
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, storedName), request.body, { flag: "wx" });
      try {
        const saved = addAttachment(db, request.user.id, id, {
          registrationId: target, kind: kind.kind, label: filename,
          originalName: filename, mimeType: kind.mimeType, storedName
        });
        if (!saved) { await removeFiles([{ storedName }]); return response.status(400).json({ error: "Bijlage niet opgeslagen." }); }
        delete saved.storedName;
        return response.status(201).json(saved);
      } catch (error) {
        await removeFiles([{ storedName }]);
        throw error;
      }
    });
  app.get("/api/devices/:id/attachments/:attachmentId/file", (request, response) => {
    const id = attachmentScope(request, response);
    if (id === null) return;
    const attId = parseId(request.params.attachmentId);
    if (attId === null) return response.status(400).json({ error: "Ongeldig bijlage-ID." });
    const item = getAttachment(db, request.user.id, id, attId);
    if (!item || !item.storedName) return response.status(404).json({ error: "Bestand niet gevonden." });
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Cache-Control", "private, no-store");
    response.type(item.mimeType);
    if (item.kind === "document") response.set("Content-Disposition", headerAttachmentName(item.originalName));
    else response.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return response.sendFile(path.join(uploadDir, item.storedName), error => {
      if (error && !response.headersSent) response.status(error.status || 404).json({ error: "Bestand niet beschikbaar." });
    });
  });
  app.delete("/api/devices/:id/attachments/:attachmentId", async (request, response) => {
    const id = attachmentScope(request, response);
    if (id === null) return;
    const attId = parseId(request.params.attachmentId);
    if (attId === null) return response.status(400).json({ error: "Ongeldig bijlage-ID." });
    const item = getAttachment(db, request.user.id, id, attId);
    if (!item) return response.status(404).json({ error: "Bijlage niet gevonden." });
    deleteAttachment(db, request.user.id, id, attId);
    await removeFiles([item]);
    return response.sendStatus(204);
  });
  app.get("/api/devices/:id/wiki", async (request, response) => {
    const id = attachmentScope(request, response);
    if (id === null) return;
    const device = getDevice(db, request.user.id, id);
    const query = [device.brand, device.model].filter(Boolean).join(" ") ||
      device.name || device.type;
    try {
      let usedQuery = query;
      let suggestions = [];
      // Zoek eerst specifiek op het toestel, daarna op de categorie als niets gevonden is.
      for (const term of [...new Set([query, device.type])]) {
        const params = new URLSearchParams({
          action: "query", generator: "search", gsrsearch: term.slice(0, 100),
          gsrlimit: "4", prop: "info|extracts", inprop: "url",
          exintro: "1", explaintext: "1", exchars: "500", format: "json", formatversion: "2"
        });
        const remote = await wikiFetch("https://nl.wikipedia.org/w/api.php?" + params,
          { headers: { "User-Agent":
              "WebProgrammingOnderhoudslogboek/0.1 (https://github.com/LorFerSilve/Web-Programming-Project)" },
            signal: AbortSignal.timeout(8000) });
        if (!remote.ok) throw new Error("Wikipedia is tijdelijk niet bereikbaar");
        const result = await remote.json();
        suggestions = (result.query?.pages || [])
          .filter(page => !page.missing && typeof page.title === "string")
          .slice(0, 4).map(page => ({
            title: page.title,
            summary: typeof page.extract === "string" ? page.extract.slice(0, 550) : "",
            url: typeof page.fullurl === "string" && page.fullurl.startsWith("https://nl.wikipedia.org/") ?
              page.fullurl : "https://nl.wikipedia.org/wiki/" + encodeURIComponent(page.title.replaceAll(" ", "_"))
          }));
        usedQuery = term;
        if (suggestions.length) break;
      }
      return response.json({ query: usedQuery, source: "Wikipedia (MediaWiki API)", suggestions });
    } catch {
      return response.status(502).json({ error: "Wikipedia kon niet worden geraadpleegd. Probeer later opnieuw." });
    }
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
  app.use((error, request, response, next) => {
    if (error.type === "entity.too.large") return response.status(413).json({ error: "Bestand te groot (maximaal 5 MB)." });
    next(error);
  });
  return app;
}
