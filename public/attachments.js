"use strict";

const attachmentPageMatch = /^\/devices\/(\d+)\/?$/.exec(window.location.pathname);
const attachmentDeviceId = attachmentPageMatch ? Number(attachmentPageMatch[1]) : null;
const attachmentsList = document.querySelector("#attachments-list");
const attachmentsStatus = document.querySelector("#attachments-status");
const attachmentDialog = document.querySelector("#attachment-dialog");
const attachmentForm = document.querySelector("#attachment-form");
const attachmentKind = document.querySelector("#attachment-kind");
const attachmentFile = document.querySelector("#attachment-file");
const attachmentTitle = document.querySelector("#attachment-title");
const attachmentUrl = document.querySelector("#attachment-url");
const attachmentRegistration = document.querySelector("#attachment-registration");
const attachmentError = document.querySelector("#attachment-error");
const attachmentSave = document.querySelector("#save-attachment");
const wikiButton = document.querySelector("#search-wiki");
const wikiStatus = document.querySelector("#wiki-status");
const wikiResults = document.querySelector("#wiki-results");
let knownRegistrations = [];

function element(tag, text = "", className = "") {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}
function showAttachmentError(text) {
  attachmentError.textContent = text;
  attachmentError.hidden = false;
}
function toastAttachment(text, error = false) {
  const toast = document.querySelector("#message");
  toast.textContent = text;
  toast.classList.toggle("toast-error", error);
  toast.hidden = false;
}
function attachmentUrlFor(item) {
  return `/api/devices/${attachmentDeviceId}/attachments/${item.id}/file`;
}
function renderAttachmentList(records) {
  attachmentsList.replaceChildren();
  if (!records.length) {
    attachmentsStatus.textContent = "Nog geen foto's, PDF's of links toegevoegd.";
    attachmentsStatus.hidden = false;
    return;
  }
  attachmentsStatus.hidden = true;
  for (const item of records) {
    const card = element("article", "", "attachment-card");
    const heading = element("div", "", "attachment-heading");
    const kind = item.kind === "photo" ? "Foto" : item.kind === "document" ? "Document" : "Link / video";
    heading.append(element("strong", item.label), element("span", kind, "attachment-kind"));
    card.append(heading);
    if (item.registrationId !== null) {
      const linked = knownRegistrations.find(reg => reg.id === item.registrationId);
      card.append(element("p", linked ?
        `Bij registratie van ${linked.date}: ${linked.description.slice(0,80)}` :
        "Bij een registratie", "attachment-context"));
    } else {
      card.append(element("p", "Algemeen bij dit toestel", "attachment-context"));
    }
    if (item.kind === "photo") {
      const preview = document.createElement("img");
      preview.src = attachmentUrlFor(item);
      preview.alt = item.label;
      preview.loading = "lazy";
      preview.className = "attachment-image";
      const link = element("a");
      link.href = attachmentUrlFor(item);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(preview);
      card.append(link);
    }
    const actions = element("div", "", "attachment-actions");
    const link = element("a", item.kind === "document" ? "PDF downloaden" :
      item.kind === "photo" ? "Foto openen" : "Link openen", "button button-secondary");
    link.href = item.kind === "link" ? item.url : attachmentUrlFor(item);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
    const remove = element("button", "Verwijderen", "button button-danger");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Bijlage “${item.label}” verwijderen?`)) return;
      remove.disabled = true;
      try {
        const response = await fetch(
          `/api/devices/${attachmentDeviceId}/attachments/${item.id}`,
          { method: "DELETE" }
        );
        if (!response.ok) throw new Error("Verwijderen mislukt");
        toastAttachment("Bijlage verwijderd.");
        await loadAttachments();
      } catch { toastAttachment("Bijlage kon niet verwijderd worden.", true); }
      finally { remove.disabled = false; }
    });
    actions.append(remove);
    card.append(actions);
    attachmentsList.append(card);
  }
}
async function loadAttachments() {
  try {
    const response = await fetch(`/api/devices/${attachmentDeviceId}/attachments`);
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (!response.ok) throw new Error();
    renderAttachmentList(await response.json());
  } catch {
    attachmentsStatus.textContent = "Bijlagen konden niet worden geladen.";
    attachmentsStatus.hidden = false;
  }
}
async function refreshRegistrationOptions() {
  try {
    const response = await fetch(`/api/devices/${attachmentDeviceId}/registrations`);
    if (!response.ok) return;
    knownRegistrations = await response.json();
    const selected = attachmentRegistration.value;
    attachmentRegistration.replaceChildren(new Option("Algemeen bij dit toestel", ""));
    for (const registration of knownRegistrations) {
      const name = `${registration.date} · ${registration.type}: ${registration.description.slice(0,55)}`;
      attachmentRegistration.add(new Option(name, String(registration.id)));
    }
    attachmentRegistration.value = [...attachmentRegistration.options].some(opt => opt.value === selected) ? selected : "";
  } catch { /* het toevoegen van een toestelbijlage blijft mogelijk */ }
}
function updateAttachmentForm() {
  const link = attachmentKind.value === "link";
  document.querySelector("#attachment-file-label").hidden = link;
  document.querySelector("#attachment-title-label").hidden = !link;
  document.querySelector("#attachment-url-label").hidden = !link;
  attachmentFile.required = !link;
  attachmentTitle.required = link;
  attachmentUrl.required = link;
}
attachmentKind.addEventListener("change", updateAttachmentForm);
document.querySelector("#add-attachment").addEventListener("click", async () => {
  attachmentForm.reset();
  attachmentError.hidden = true;
  updateAttachmentForm();
  await refreshRegistrationOptions();
  attachmentDialog.showModal();
});
for (const id of ["close-attachment","cancel-attachment"]) {
  document.querySelector("#" + id).addEventListener("click", () => {
    if (!attachmentSave.disabled) attachmentDialog.close();
  });
}
attachmentForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (attachmentSave.disabled) return;
  attachmentError.hidden = true;
  attachmentSave.disabled = true;
  try {
    const registrationId = attachmentRegistration.value;
    let response;
    if (attachmentKind.value === "file") {
      const file = attachmentFile.files[0];
      if (!file || file.size > 5 * 1024 * 1024) {
        throw new Error("Kies een bestand van maximaal 5 MB.");
      }
      const url = `/api/devices/${attachmentDeviceId}/attachments/file` +
        (registrationId ? `?registrationId=${encodeURIComponent(registrationId)}` : "");
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name) },
        body: file
      });
    } else {
      response = await fetch(`/api/devices/${attachmentDeviceId}/attachments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: attachmentTitle.value, url: attachmentUrl.value,
          registrationId: registrationId || null
        })
      });
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Bijlage opslaan mislukt.");
    }
    attachmentDialog.close();
    toastAttachment("Bijlage toegevoegd.");
    await loadAttachments();
  } catch (error) { showAttachmentError(error.message); }
  finally { attachmentSave.disabled = false; }
});

wikiButton.addEventListener("click", async () => {
  wikiButton.disabled = true;
  wikiStatus.textContent = "Wikipedia wordt geraadpleegd…";
  wikiStatus.hidden = false;
  wikiResults.replaceChildren();
  try {
    const response = await fetch(`/api/devices/${attachmentDeviceId}/wiki`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Opzoeken mislukt.");
    }
    const data = await response.json();
    wikiStatus.textContent = data.suggestions.length ?
      `Wikipedia-zoekresultaten voor “${data.query}”:` :
      "Geen relevante Wikipedia-artikelen gevonden. Probeer een duidelijkere toestelnaam of een merk.";
    for (const suggestion of data.suggestions) {
      const card = element("article", "", "wiki-result");
      const title = element("h4", suggestion.title);
      const summary = element("p", suggestion.summary || "Geen samenvatting beschikbaar.");
      const actions = element("div", "", "attachment-actions");
      const link = element("a", "Lees artikel", "button button-secondary");
      link.href = suggestion.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const save = element("button", "Bewaar als link", "button button-primary");
      save.type = "button";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          const result = await fetch(`/api/devices/${attachmentDeviceId}/attachments`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: `Wikipedia: ${suggestion.title}`,
              url: suggestion.url, registrationId: null })
          });
          if (!result.ok) throw new Error("Niet opgeslagen");
          toastAttachment("Wikipedia-bron toegevoegd als link.");
          await loadAttachments();
        } catch { toastAttachment("Bron kon niet worden bewaard.", true); }
        finally { save.disabled = false; }
      });
      actions.append(link, save);
      card.append(title, summary, actions);
      wikiResults.append(card);
    }
  } catch (error) {
    wikiStatus.textContent = error.message;
  } finally { wikiButton.disabled = false; }
});

document.addEventListener("registrations-changed", async () => {
  await refreshRegistrationOptions();
  await loadAttachments();
});
if (Number.isSafeInteger(attachmentDeviceId) && attachmentDeviceId > 0) {
  refreshRegistrationOptions().then(loadAttachments);
}
