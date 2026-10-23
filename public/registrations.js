"use strict";

// De toestel-ID komt uit de URL; de backend controleert bij iedere actie de eigenaar.
const registrationMatch = /^\/devices\/(\d+)\/?$/.exec(window.location.pathname);
const registrationDeviceId = registrationMatch ? Number(registrationMatch[1]) : null;
const registrationDialog = document.querySelector("#registration-dialog");
const registrationForm = document.querySelector("#registration-form");
const registrationError = document.querySelector("#registration-error");
const registrationSave = document.querySelector("#save-registration");
const registrationsList = document.querySelector("#registrations-list");
const registrationsMessage = document.querySelector("#registrations-message");
const registrationKinds = { onderhoud: "Onderhoud", defect: "Defect", herstelling: "Herstelling" };
const registrationCurrency = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
let registrations = [];
let editingRegistrationId = null;

function registrationDate(value) {
  return new Intl.DateTimeFormat("nl-BE", { year: "numeric", month: "long", day: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}
function registrationToday() {
  const value = new Date();
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")].join("-");
}
function registrationNode(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function registrationToast(text, error = false) {
  const toast = document.querySelector("#message");
  toast.textContent = text;
  toast.classList.toggle("toast-error", error);
  toast.hidden = false;
}
function openRegistrationForm(registration = null) {
  editingRegistrationId = registration?.id ?? null;
  registrationForm.reset();
  registrationError.hidden = true;
  document.querySelector("#registration-title").textContent =
    registration ? "Registratie bewerken" : "Registratie toevoegen";
  registrationSave.textContent = registration ? "Wijzigingen opslaan" : "Opslaan";
  registrationForm.elements.namedItem("type").value = registration?.type ?? "onderhoud";
  registrationForm.elements.namedItem("date").value = registration?.date ?? registrationToday();
  registrationForm.elements.namedItem("description").value = registration?.description ?? "";
  registrationForm.elements.namedItem("cost").value = registration?.cost ?? "";
  registrationDialog.showModal();
}
function closeRegistrationForm() {
  if (!registrationSave.disabled) registrationDialog.close();
}
document.querySelector("#add-registration").addEventListener("click", () => openRegistrationForm());
document.querySelector("#close-registration").addEventListener("click", closeRegistrationForm);
document.querySelector("#cancel-registration").addEventListener("click", closeRegistrationForm);

function renderRegistrations() {
  registrationsList.replaceChildren();
  if (registrations.length === 0) {
    registrationsMessage.textContent = "Nog geen registraties voor dit toestel.";
    registrationsMessage.hidden = false;
    return;
  }
  registrationsMessage.hidden = true;
  for (const item of registrations) {
    const card = document.createElement("article");
    card.className = "registration-card";
    const head = document.createElement("div");
    head.className = "registration-card-top";
    const type = registrationNode("span", registrationKinds[item.type] || item.type);
    type.className = `registration-kind registration-kind-${item.type}`;
    const date = registrationNode("time", registrationDate(item.date));
    date.dateTime = item.date;
    date.className = "registration-date";
    head.append(type, date);

    const description = registrationNode("p", item.description);
    description.className = "registration-description";
    const footer = document.createElement("div");
    footer.className = "registration-footer";
    const costs = registrationNode("span", item.cost === null ?
      "Kosten: niet ingevuld" : `Kosten: ${registrationCurrency.format(item.cost)}`);
    costs.className = "registration-cost";
    const actions = document.createElement("div");
    actions.className = "registration-actions";
    const edit = registrationNode("button", "Bewerken");
    edit.type = "button";
    edit.className = "button button-secondary";
    edit.addEventListener("click", () => openRegistrationForm(item));
    const remove = registrationNode("button", "Verwijderen");
    remove.type = "button";
    remove.className = "button button-danger";
    remove.addEventListener("click", () => removeRegistration(item, remove));
    actions.append(edit, remove);
    footer.append(costs, actions);
    card.append(head, description, footer);
    registrationsList.append(card);
  }
}

async function loadRegistrations() {
  registrationsMessage.textContent = "Registraties laden…";
  registrationsMessage.hidden = false;
  try {
    const response = await fetch(`/api/devices/${registrationDeviceId}/registrations`);
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (!response.ok) throw new Error("Ophalen mislukt");
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("Ongeldig antwoord");
    registrations = records;
    renderRegistrations();
  } catch (error) {
    registrationsList.replaceChildren();
    registrationsMessage.textContent = "Registraties niet beschikbaar. Herlaad de pagina om opnieuw te proberen.";
    registrationsMessage.hidden = false;
  }
}

registrationForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (registrationSave.disabled) return;
  const values = new FormData(registrationForm);
  const rawCost = String(values.get("cost") ?? "").trim();
  const payload = {
    type: String(values.get("type") || ""),
    date: String(values.get("date") || ""),
    description: String(values.get("description") || "").trim(),
    cost: rawCost === "" ? null : Number(rawCost)
  };
  const editing = editingRegistrationId !== null;
  const target = `/api/devices/${registrationDeviceId}/registrations` +
    (editing ? `/${editingRegistrationId}` : "");
  registrationError.hidden = true;
  registrationSave.disabled = true;
  try {
    const response = await fetch(target, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Opslaan mislukt");
    }
    registrationDialog.close();
    editingRegistrationId = null;
    registrationToast(editing ? "Registratie bijgewerkt." : "Registratie toegevoegd.");
    await loadRegistrations();
  } catch (error) {
    registrationError.textContent = `Registratie niet opgeslagen: ${error.message}`;
    registrationError.hidden = false;
  } finally {
    registrationSave.disabled = false;
  }
});

async function removeRegistration(registration, button) {
  if (!window.confirm(`Weet je zeker dat je deze ${registrationKinds[registration.type].toLowerCase()} wilt verwijderen?`)) return;
  button.disabled = true;
  try {
    const response = await fetch(
      `/api/devices/${registrationDeviceId}/registrations/${registration.id}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Verwijderen mislukt");
    }
    registrationToast("Registratie verwijderd.");
    await loadRegistrations();
  } catch (error) {
    registrationToast(`Registratie niet verwijderd: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

if (Number.isSafeInteger(registrationDeviceId) && registrationDeviceId > 0) {
  loadRegistrations();
}
