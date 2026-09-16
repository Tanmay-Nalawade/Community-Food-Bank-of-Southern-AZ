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

  // "← Back to X" links across the app point at a fixed destination (e.g.
  // the reservations list), which is wrong whenever the page was actually
  // reached from somewhere else (a dashboard notification, a driver's page,
  // etc.). Prefer real browser history when there's somewhere to go back
  // to, and only fall back to the link's hardcoded href (still present in
  // the markup) when there isn't — e.g. the page was opened directly.
  const backLink = event.target.closest(".vehicle-detail__back");
  if (backLink && window.history.length > 1) {
    event.preventDefault();
    window.history.back();
  }
});

// Inline field validation for forms opted out of native browser validation
// (novalidate) so errors render inside our own card instead of the browser's
// default tooltip UI.
(() => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const VALIDATORS = {
    firstName: (value) => (value.trim() ? "" : "First name is required."),
    lastName: (value) => (value.trim() ? "" : "Last name is required."),
    email: (value) => {
      if (!value.trim()) return "Email is required.";
      return EMAIL_PATTERN.test(value.trim()) ? "" : "Please enter a valid email address.";
    },
    currentPassword: (value) => (value ? "" : "Your current password is required."),
    newPassword: (value) => {
      if (!value) return "New password is required.";
      return value.length >= 8 ? "" : "New password must be at least 8 characters.";
    },
    confirmNewPassword: (value, form) => {
      if (!value) return "Please confirm your new password.";
      const newPasswordInput = form.querySelector("#newPassword");
      return newPasswordInput && value === newPasswordInput.value ? "" : "Passwords do not match.";
    },
  };

  function setFieldError(input, message) {
    const group = input.closest(".auth-form__group");
    const errorEl = group && group.querySelector(".auth-form__field-error");
    if (errorEl) errorEl.textContent = message || "";
    input.classList.toggle("auth-form__input--invalid", Boolean(message));
  }

  function validateField(input) {
    const validator = VALIDATORS[input.id];
    if (!validator) return true;
    const message = validator(input.value, input.form);
    setFieldError(input, message);
    return !message;
  }

  document.querySelectorAll(".auth-form[novalidate]").forEach((form) => {
    const fields = Array.from(form.elements).filter((el) => VALIDATORS[el.id]);

    fields.forEach((input) => {
      input.addEventListener("input", () => {
        validateField(input);
        if (input.id === "newPassword") {
          const confirmInput = form.querySelector("#confirmNewPassword");
          if (confirmInput && confirmInput.value) validateField(confirmInput);
        }
      });
    });

    form.addEventListener("submit", (event) => {
      let firstInvalid = null;
      fields.forEach((input) => {
        if (!validateField(input) && !firstInvalid) firstInvalid = input;
      });
      if (firstInvalid) {
        event.preventDefault();
        firstInvalid.focus();
      }
    });
  });
})();
