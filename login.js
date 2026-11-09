const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) {
    return;
  }

  loginMessage.textContent = "Sign-in is not connected yet. Continue to the weather dashboard to get started.";
});
