"use strict";

const userLabel = document.querySelector("#current-user");
const logoutButton = document.querySelector("#logout-button");

fetch("/api/auth/me").then(async response => {
  if (response.status === 401) {
    window.location.replace("/login");
    return;
  }
  if (!response.ok) throw new Error("Sessie niet beschikbaar");
  const result = await response.json();
  userLabel.textContent = result.user.name;
}).catch(() => { userLabel.textContent = "Sessie niet beschikbaar"; });

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Uitloggen mislukt");
    window.location.replace("/login");
  } catch (error) {
    logoutButton.disabled = false;
    window.alert("Uitloggen is niet gelukt. Probeer opnieuw.");
  }
});
