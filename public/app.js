"use strict";

// Voorbeeldgegevens voor deze frontendstap. In een volgende stap komen deze uit de backend.
function dateIn(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const devices = [
  { id: 1, name: "Stadsfiets", type: "fiets", brand: "Gazelle", model: "Esprit", nextMaintenance: dateIn(12) },
  { id: 2, name: "Koffiemachine", type: "apparaat", brand: "De'Longhi", model: "Magnifica", nextMaintenance: dateIn(-5) },
  { id: 3, name: "3D-printer", type: "apparaat", brand: "Bambu Lab", model: "A1", nextMaintenance: dateIn(65) }
];

const categories = { fiets: "Fiets", voertuig: "Voertuig", apparaat: "Apparaat", overig: "Overig" };
const icons = { fiets: "F", voertuig: "V", apparaat: "A", overig: "O" };
const list = document.querySelector("#device-list");
const search = document.querySelector("#search");
const typeFilter = document.querySelector("#type-filter");
const addDialog = document.querySelector("#add-dialog");
const detailDialog = document.querySelector("#detail-dialog");
const addForm = document.querySelector("#add-form");
const message = document.querySelector("#message");

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
  const button = make("button", "detail-button", "Bekijk details →");
  button.type = "button";
  button.setAttribute("aria-label", `Bekijk details van ${device.name}`);
  button.addEventListener("click", () => showDetails(device));
  footer.append(button);
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
  if (!cards.length) {
    const empty = make("div", "empty");
    empty.append(make("strong", "", "Geen toestellen gevonden"), make("span", "", "Pas je zoekopdracht of categorie aan."));
    cards.push(empty);
  }
  list.replaceChildren(...cards);
  document.querySelector("#count-devices").textContent = devices.length;
  document.querySelector("#count-planned").textContent = devices.filter(device => device.nextMaintenance && !isOverdue(device.nextMaintenance)).length;
  document.querySelector("#count-overdue").textContent = devices.filter(device => isOverdue(device.nextMaintenance)).length;
  document.querySelector("#result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "toestel" : "toestellen"}`;
}

function showDetails(device) {
  document.querySelector("#detail-title").textContent = device.name;
  const details = document.querySelector("#detail-content");
  details.replaceChildren();
  for (const [label, value] of [
    ["Categorie", categories[device.type]], ["Merk", device.brand || "—"],
    ["Model", device.model || "—"], ["Volgend onderhoud", dateLabel(device.nextMaintenance)]
  ]) {
    details.append(make("dt", "", label), make("dd", "", value));
  }
  detailDialog.showModal();
}

function closeDialog(dialog) { dialog.close(); }

document.querySelector("#open-add").addEventListener("click", () => addDialog.showModal());
document.querySelector("#cancel-add").addEventListener("click", () => closeDialog(addDialog));
document.querySelector("#cancel-add-bottom").addEventListener("click", () => closeDialog(addDialog));
document.querySelector("#close-detail").addEventListener("click", () => closeDialog(detailDialog));
document.querySelector("#close-detail-bottom").addEventListener("click", () => closeDialog(detailDialog));
search.addEventListener("input", render);
typeFilter.addEventListener("change", render);

addForm.addEventListener("submit", event => {
  event.preventDefault();
  const values = new FormData(addForm);
  const name = String(values.get("name") || "").trim();
  if (!name) { document.querySelector("#device-name").focus(); return; }
  const type = String(values.get("type"));
  if (!Object.hasOwn(categories, type)) return;
  devices.unshift({
    id: Math.max(0, ...devices.map(device => device.id)) + 1,
    name, type,
    brand: String(values.get("brand") || "").trim(),
    model: String(values.get("model") || "").trim(),
    nextMaintenance: String(values.get("nextMaintenance") || "")
  });
  search.value = "";
  typeFilter.value = "all";
  addForm.reset();
  addDialog.close();
  render();
  message.textContent = `“${name}” toegevoegd voor deze browsersessie (nog niet opgeslagen).`;
  message.hidden = false;
});

render();