const signupForm = document.querySelector("#signup-form");
const signupMessage = document.querySelector("#signup-message");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!signupForm.reportValidity()) {
    return;
  }

  if (passwordInput.value !== confirmPasswordInput.value) {
    confirmPasswordInput.setCustomValidity("Passwords do not match.");
    confirmPasswordInput.reportValidity();
    confirmPasswordInput.addEventListener("input", () => confirmPasswordInput.setCustomValidity(""), {once: true});
    return;
  }

  signupMessage.textContent = "Account creation is not connected yet. You can still explore the weather dashboard.";
});
