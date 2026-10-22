import express from "express";
import { fileURLToPath } from "node:url";

const app = express();

// Een eerste backendroute om te controleren of de server werkt.
app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

// De bestaande HTML-, CSS- en JavaScriptbestanden worden door Express geserveerd.
app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))));

export default app;
