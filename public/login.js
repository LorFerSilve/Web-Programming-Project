"use strict";

const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const switchButton = document.querySelector("#switch-mode");
const errorBox = document.querySelector("#auth-error");
let registering = false;

switchButton.addEventListener("click", () => {
  registering = !registering;
  loginForm.hidden = registering;
  registerForm.hidden = !registering;
  errorBox.hidden = true;
  document.querySelector("#auth-title").textContent = registering ? "Account aanmaken" : "Inloggen";
  document.querySelector("#auth-description").textContent = registering ?
    "Registreer je om je eigen toestellen te beheren." :
    "Log in om je eigen toestellen en hun onderhoudsgegevens te beheren.";
  document.querySelector("#switch-description").textContent = registering ?
    "Heb je al een account?" : "Nog geen account?";
  switchButton.textContent = registering ? "Inloggen" : "Registreren";
});

async function submitAuth(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const values = new FormData(form);
  const payload = {
    email: String(values.get("email") || "").trim(),
    password: String(values.get("password") || "")
  };
  if (mode === "register") payload.name = String(values.get("name") || "").trim();
  errorBox.hidden = true;
  button.disabled = true;
  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Er is iets misgegaan.");
    }
    window.location.assign("/");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
  }
}
loginForm.addEventListener("submit", event => submitAuth(event, "login"));
registerForm.addEventListener("submit", event => submitAuth(event, "register"));
