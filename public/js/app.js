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

  // Mirrors strongPasswordSchema() in validators/user.js — kept in sync
  // manually since there's no shared config between server and client JS.
  const PASSWORD_RULES = [
    { key: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
    { key: "lowercase", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
    { key: "uppercase", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
    { key: "number", label: "One number", test: (v) => /[0-9]/.test(v) },
    { key: "special", label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
  ];

  const VALIDATORS = {
    firstName: (value) => (value.trim() ? "" : "First name is required."),
    lastName: (value) => (value.trim() ? "" : "Last name is required."),
    email: (value, form, input) => {
      const trimmed = value.trim();
      if (!trimmed) return "Email is required.";
      if (!EMAIL_PATTERN.test(trimmed)) return "Please enter a valid email address.";

      // Only set on the register/account-edit email fields (see
      // data-require-domain in those views) — login/forgot-password/resend
      // just look an existing account up, so they don't enforce this.
      const requiredDomain = input && input.dataset.requireDomain;
      if (requiredDomain && !trimmed.toLowerCase().endsWith(requiredDomain.toLowerCase())) {
        return `You need to use an email address given to you by the Food Bank (ends in ${requiredDomain}).`;
      }
      return "";
    },
    currentPassword: (value) => (value ? "" : "Your current password is required."),
    password: (value) => {
      if (!value) return "Password is required.";
      return PASSWORD_RULES.every((rule) => rule.test(value))
        ? ""
        : "Password doesn't meet all the requirements above.";
    },
    confirmPassword: (value, form) => {
      if (!value) return "Please confirm your password.";
      const passwordInput = form.querySelector("#password");
      return passwordInput && value === passwordInput.value ? "" : "Passwords do not match.";
    },
    newPassword: (value) => {
      if (!value) return "New password is required.";
      return PASSWORD_RULES.every((rule) => rule.test(value))
        ? ""
        : "Password doesn't meet all the requirements above.";
    },
    confirmNewPassword: (value, form) => {
      if (!value) return "Please confirm your new password.";
      const newPasswordInput = form.querySelector("#newPassword");
      return newPasswordInput && value === newPasswordInput.value ? "" : "Passwords do not match.";
    },
  };

  const CONFIRM_FIELD_FOR = { password: "confirmPassword", newPassword: "confirmNewPassword" };

  function setFieldError(input, message) {
    const group = input.closest(".auth-form__group");
    const errorEl = group && group.querySelector(".auth-form__field-error");
    if (errorEl) errorEl.textContent = message || "";
    input.classList.toggle("auth-form__input--invalid", Boolean(message));
  }

  function validateField(input) {
    const validator = VALIDATORS[input.id];
    if (!validator) return true;
    const message = validator(input.value, input.form, input);
    setFieldError(input, message);
    return !message;
  }

  document.querySelectorAll(".auth-form[novalidate]").forEach((form) => {
    const fields = Array.from(form.elements).filter((el) => VALIDATORS[el.id]);

    fields.forEach((input) => {
      input.addEventListener("input", () => {
        validateField(input);
        const confirmFieldId = CONFIRM_FIELD_FOR[input.id];
        const confirmInput = confirmFieldId && form.querySelector(`#${confirmFieldId}`);
        if (confirmInput && confirmInput.value) validateField(confirmInput);
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

  // Live password strength checklist: any input marked .js-password-strength
  // gets its sibling .password-checklist items lit up green as each rule is
  // satisfied while typing (checked against the same PASSWORD_RULES used
  // above for the pass/fail message).
  document.querySelectorAll(".js-password-strength").forEach((input) => {
    const group = input.closest(".auth-form__group");
    const checklist = group && group.querySelector(".password-checklist");
    if (!checklist) return;

    const items = PASSWORD_RULES.map((rule) => ({
      rule,
      el: checklist.querySelector(`[data-rule="${rule.key}"]`),
    }));

    function updateChecklist() {
      items.forEach(({ rule, el }) => {
        if (el) el.classList.toggle("password-checklist__item--met", rule.test(input.value));
      });
    }

    input.addEventListener("input", updateChecklist);
    updateChecklist();
  });
})();

// Generic "Load more" lazy loading: any button with data-load-more fetches
// the next batch of rows as an HTML fragment from data-url and appends it
// to the element named by data-target, using the X-Has-More response
// header (not the row count) to decide whether to keep offering another
// batch — so this works correctly even when a batch happens to come back
// exactly page-size long.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-load-more]");
  if (!button) {
    return;
  }

  const target = document.getElementById(button.dataset.target);
  if (!target) {
    return;
  }

  const skip = Number(button.dataset.skip) || 0;
  const originalLabel = button.textContent;

  button.disabled = true;
  button.textContent = "Loading…";

  try {
    // data-url may already carry filter params (e.g. "?status=Pending"), so
    // don't assume "?" is safe to prepend — reuse "&" when it already has one.
    const separator = button.dataset.url.includes("?") ? "&" : "?";
    const response = await fetch(`${button.dataset.url}${separator}skip=${skip}`);
    const html = await response.text();

    if (html.trim()) {
      target.insertAdjacentHTML("beforeend", html);
    }

    if (response.headers.get("X-Has-More") === "1") {
      button.dataset.skip = skip + Number(button.dataset.pageSize);
      button.disabled = false;
      button.textContent = originalLabel;
    } else {
      button.remove();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
  }
});

// Disable a form's submit button(s) right after a real submission goes
// through, so a double-click (or an impatient second tap while the page is
// still loading) can't fire the same request twice — e.g. adding a vehicle
// or booking a reservation twice. Runs after any other submit listener
// (inline validation, etc.) since the event bubbles from the form up to
// document, so a prevented/invalid submission is correctly left alone.
document.addEventListener("submit", (event) => {
  if (event.defaultPrevented) {
    return;
  }

  event.target
    .querySelectorAll('button[type="submit"], input[type="submit"]')
    .forEach((button) => {
      button.disabled = true;
    });
});
