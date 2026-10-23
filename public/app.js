"use strict";

// De toestellen worden bij het openen van de pagina via Express uit SQLite geladen.
function dateIn(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

let devices = [];
let loading = true;
let loadFailed = false;

const categories = { fiets: "Fiets", voertuig: "Voertuig", apparaat: "Apparaat", overig: "Overig" };
const icons = { fiets: "F", voertuig: "V", apparaat: "A", overig: "O" };
const list = document.querySelector("#device-list");
const search = document.querySelector("#search");
const typeFilter = document.querySelector("#type-filter");
const addDialog = document.querySelector("#add-dialog");
const addForm = document.querySelector("#add-form");
const message = document.querySelector("#message");
const openAddButton = document.querySelector("#open-add");
const saveButton = addForm.querySelector('button[type="submit"]');
const formError = document.querySelector("#form-error");
openAddButton.disabled = true;

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("toast-error", error);
  message.hidden = false;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`)) : "Niet gepland";
}

function isOverdue(value) {
  return Boolean(value && value < dateIn(0));
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function deviceCard(device) {
  const card = make("article", "device-card");
  const top = make("div", "card-top");
  const icon = make("span", "device-icon", icons[device.type]);
  icon.setAttribute("aria-hidden", "true");
  const status = make("span", `status ${device.nextMaintenance ? (isOverdue(device.nextMaintenance) ? "overdue" : "upcoming") : "unplanned"}`,
    !device.nextMaintenance ? "Niet gepland" : isOverdue(device.nextMaintenance) ? "Achterstallig" : "Gepland");
  top.append(icon, status);

  const heading = make("div");
  heading.append(make("h3", "device-name", device.name),
    make("p", "device-model", [device.brand, device.model].filter(Boolean).join(" · ") || categories[device.type]));

  const date = make("p", "maintenance-line", `Volgend onderhoud: ${dateLabel(device.nextMaintenance)}`);
  const footer = make("div", "card-footer");
  const link = make("a", "detail-button", "Bekijk details →");
  link.href = `/devices/${device.id}`;
  link.setAttribute("aria-label", `Bekijk details van ${device.name}`);
  footer.append(link);
  card.append(top, heading, date, footer);
  return card;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase("nl-BE");
  const category = typeFilter.value;
  const filtered = devices.filter(device =>
    (category === "all" || device.type === category) &&
    [device.name, device.brand, device.model].some(value => value.toLocaleLowerCase("nl-BE").includes(query))
  );

  const cards = filtered.map(deviceCard);
  if (loading || loadFailed || !cards.length) {
    const empty = make("div", "empty");
    const title = loading ? "Toestellen laden…" : loadFailed ? "Toestellen niet beschikbaar" :
      devices.length ? "Geen toestellen gevonden" : "Nog geen toestellen";
    const description = loading ? "Gegevens worden opgehaald van de server." :
      loadFailed ? "Controleer of de server draait en vernieuw de pagina." :
      devices.length ? "Pas je zoekopdracht of categorie aan." : "Voeg je eerste toestel toe om te beginnen.";
    empty.append(make("strong", "", title), make("span", "", description));
    cards.push(empty);
  }
  list.replaceChildren(...cards);
  document.querySelector("#count-devices").textContent = devices.length;
  document.querySelector("#count-planned").textContent = devices.filter(device => device.nextMaintenance && !isOverdue(device.nextMaintenance)).length;
  document.querySelector("#count-overdue").textContent = devices.filter(device => isOverdue(device.nextMaintenance)).length;
  document.querySelector("#result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "toestel" : "toestellen"}`;
}

function closeDialog() { addDialog.close(); }

function openDeviceForm() {
  addForm.reset();
  formError.hidden = true;
  addDialog.showModal();
}

document.querySelector("#open-add").addEventListener("click", openDeviceForm);
document.querySelector("#cancel-add").addEventListener("click", closeDialog);
document.querySelector("#cancel-add-bottom").addEventListener("click", closeDialog);
search.addEventListener("input", render);
typeFilter.addEventListener("change", render);

async function loadDevices() {
  try {
    const response = await fetch("/api/devices");
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (!response.ok) throw new Error("Ophalen mislukt");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Ongeldig antwoord van de server");
    devices = data;
    openAddButton.disabled = false;
  } catch (error) {
    loadFailed = true;
    showMessage("De toestellen konden niet worden opgehaald. Controleer de server en herlaad de pagina.", true);
  } finally {
    loading = false;
    render();
  }
}

addForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (saveButton.disabled) return;
  const values = new FormData(addForm);
  const device = {
    name: String(values.get("name") || "").trim(),
    type: String(values.get("type") || ""),
    brand: String(values.get("brand") || "").trim(),
    model: String(values.get("model") || "").trim(),
    purchaseDate: String(values.get("purchaseDate") || ""),
    nextMaintenance: String(values.get("nextMaintenance") || "")
  };
  if (!device.name) {
    document.querySelector("#device-name").focus();
    return;
  }
  if (!Object.hasOwn(categories, device.type)) return;

  formError.hidden = true;
  saveButton.disabled = true;
  try {
    const response = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(device)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Opslaan mislukt");
    }
    const saved = await response.json();
    devices.unshift(saved);
    search.value = "";
    typeFilter.value = "all";
    addForm.reset();
    addDialog.close();
    render();
    showMessage(`“${saved.name}” is toegevoegd in de database.`);
  } catch (error) {
    formError.textContent = `Toestel niet opgeslagen: ${error.message}`;
    formError.hidden = false;
  } finally {
    saveButton.disabled = false;
  }
});

render();
loadDevices();
