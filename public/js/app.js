document.addEventListener("click", (event) => {
  document.querySelectorAll(".site-navbar__account[open]").forEach((menu) => {
    if (!menu.contains(event.target)) {
      menu.removeAttribute("open");
    }
  });

  const dismissButton = event.target.closest(".flash__close");
  if (dismissButton) {
    const flash = dismissButton.closest(".flash");
    if (flash) {
      flash.remove();
    }
  }

  const toggleButton = event.target.closest(".auth-form__toggle-password");
  if (toggleButton) {
    const input = document.getElementById(toggleButton.dataset.target);
    if (input) {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      toggleButton.textContent = isHidden ? "Hide" : "Show";
    }
  }
});
