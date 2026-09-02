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
});
