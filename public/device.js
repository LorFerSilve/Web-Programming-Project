"use strict";

const categories = { fiets: "Fiets", voertuig: "Voertuig", apparaat: "Apparaat", overig: "Overig" };
const pageMessage = document.querySelector("#page-message");
const content = document.querySelector("#device-content");
const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
const formError = document.querySelector("#form-error");
const saveButton = editForm.querySelector('button[type="submit"]');
const editButton = document.querySelector("#edit-device");
const deleteButton = document.querySelector("#delete-device");
const toast = document.querySelector("#message");

const match = /^\/devices\/(\d+)\/?$/.exec(window.location.pathname);
const deviceId = match ? Number(match[1]) : null;
let currentDevice = null;

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat("nl-BE", {
    day: "numeric", month: "long", year: "numeric"
  }).format(new Date(`${value}T12:00:00`)) : "Niet ingevuld";
}

function today() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

function make(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function showMessage(text, error = false) {
  toast.textContent = text;
  toast.classList.toggle("toast-error", error);
  toast.hidden = false;
}

function showError(text) {
  content.hidden = true;
  pageMessage.textContent = text;
  pageMessage.hidden = false;
}

function renderDevice(device) {
  currentDevice = device;
  document.title = `${device.name} | Onderhoudslogboek`;
  document.querySelector("#device-title").textContent = device.name;
  document.querySelector("#device-subtitle").textContent =
    [device.brand, device.model].filter(Boolean).join(" · ") || categories[device.type];

  const fields = document.querySelector("#device-fields");
  fields.replaceChildren();
  for (const [label, value] of [
    ["Categorie", categories[device.type]],
    ["Merk", device.brand || "—"],
    ["Model", device.model || "—"],
    ["Aankoopdatum", dateLabel(device.purchaseDate)],
    ["Volgend onderhoud", device.nextMaintenance ? dateLabel(device.nextMaintenance) : "Niet gepland"]
  ]) {
    fields.append(make("dt", label), make("dd", value));
  }

  document.querySelector("#device-notes-text").textContent =
    device.notes || "Nog geen notities over dit toestel.";
  const status = document.querySelector("#maintenance-status");
  status.className = "status";
  if (!device.nextMaintenance) {
    status.classList.add("unplanned");
    status.textContent = "Niet gepland";
  } else if (device.nextMaintenance < today()) {
    status.classList.add("overdue");
    status.textContent = "Achterstallig";
  } else {
    status.classList.add("upcoming");
    status.textContent = "Gepland";
  }
  document.querySelector("#maintenance-date").textContent =
    device.nextMaintenance ? dateLabel(device.nextMaintenance) : "Nog geen datum gepland";

  pageMessage.hidden = true;
  content.hidden = false;
}

async function loadDevice() {
  if (!Number.isSafeInteger(deviceId) || deviceId <= 0) {
    showError("Ongeldige toestel-URL.");
    return;
  }
  try {
    const response = await fetch(`/api/devices/${deviceId}`);
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (response.status === 404) {
      showError("Dit toestel bestaat niet meer. Ga terug naar het overzicht.");
      return;
    }
    if (!response.ok) throw new Error("Ophalen mislukt");
    renderDevice(await response.json());
  } catch (error) {
    showError("Het toestel kon niet worden geladen. Controleer de verbinding en herlaad de pagina.");
  }
}

editButton.addEventListener("click", () => {
  if (!currentDevice) return;
  editForm.reset();
  formError.hidden = true;
  for (const key of ["name", "type", "brand", "model", "purchaseDate", "nextMaintenance", "notes"]) {
    editForm.elements.namedItem(key).value = currentDevice[key] || "";
  }
  editDialog.showModal();
});

function closeEdit() {
  if (!saveButton.disabled) editDialog.close();
}
document.querySelector("#cancel-edit").addEventListener("click", closeEdit);
document.querySelector("#cancel-edit-bottom").addEventListener("click", closeEdit);

editForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentDevice || saveButton.disabled) return;
  const values = new FormData(editForm);
  const updated = {
    name: String(values.get("name") || "").trim(),
    type: String(values.get("type") || ""),
    brand: String(values.get("brand") || "").trim(),
    model: String(values.get("model") || "").trim(),
    purchaseDate: String(values.get("purchaseDate") || ""),
    nextMaintenance: String(values.get("nextMaintenance") || ""),
    notes: String(values.get("notes") || "")
  };
  if (!updated.name) {
    editForm.elements.namedItem("name").focus();
    return;
  }
  saveButton.disabled = true;
  formError.hidden = true;
  try {
    const response = await fetch(`/api/devices/${deviceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Opslaan mislukt");
    }
    renderDevice(await response.json());
    editDialog.close();
    showMessage("De toestelgegevens zijn bijgewerkt.");
  } catch (error) {
    formError.textContent = `Wijzigingen niet opgeslagen: ${error.message}`;
    formError.hidden = false;
  } finally {
    saveButton.disabled = false;
  }
});

deleteButton.addEventListener("click", async () => {
  if (!currentDevice ||
    !window.confirm(`Weet je zeker dat je “${currentDevice.name}” wilt verwijderen?`)) return;
  editButton.disabled = true;
  deleteButton.disabled = true;
  try {
    const response = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Verwijderen mislukt");
    }
    window.location.assign("/#devices");
  } catch (error) {
    showMessage(`Toestel niet verwijderd: ${error.message}`, true);
    editButton.disabled = false;
    deleteButton.disabled = false;
  }
});

loadDevice();
