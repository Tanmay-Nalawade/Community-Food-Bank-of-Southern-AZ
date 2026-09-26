const keycafe = require("../../services/keycafe");
const { Vehicle } = require("../../models");
const { isRealKeyCafeId } = require("../../services/keycafe/vehicleKeySync");

// hasRealId is a local, format-only check (is keyCafeKeyId a positive
// number?) — it can't tell a live key from one that was later deleted or
// belongs to a different KeyCafe account. keyCafeAccessValid/CheckedAt are
// only ever set by the "Check KeyCafe Access" action below (a real lookup
// against KeyCafe), so a vehicle can be "created" here but not yet verified.
function buildVehicleKeyStatus(vehicle) {
  const hasRealId = isRealKeyCafeId(vehicle.keyCafeKeyId);
  let slug = "inactive-account";
  let label = "Not created";
  let needsAttention = true;

  if (hasRealId) {
    if (vehicle.keyCafeAccessValid === false) {
      slug = "inactive-account";
      label = "Missing in KeyCafe";
      needsAttention = true;
    } else if (vehicle.keyCafeAccessValid === true) {
      slug = "active-account";
      label = "Verified";
      needsAttention = false;
    } else {
      slug = "active-account";
      label = "Created (not yet verified)";
      needsAttention = false;
    }
  }

  return {
    id: vehicle.id,
    label: `${vehicle.year ? vehicle.year + " " : ""}${vehicle.make} ${vehicle.model}`,
    licensePlate: vehicle.licensePlate,
    slug,
    statusLabel: label,
    needsAttention,
    checkedAt: vehicle.keyCafeAccessCheckedAt || null,
  };
}

exports.index = async (req, res) => {
  const vehicles = await Vehicle.findAll({ order: [["make", "ASC"], ["model", "ASC"]] });

  const vehicleKeyStatuses = vehicles.map(buildVehicleKeyStatus);
  const missingCount = vehicleKeyStatuses.filter((v) => v.needsAttention).length;
  const lastCheckedAt = vehicleKeyStatuses.reduce(
    (latest, v) => (v.checkedAt && (!latest || v.checkedAt > latest) ? v.checkedAt : latest),
    null,
  );

  res.render("it/api-status/index", {
    title: "API Status",
    keycafeConfigured: keycafe.isConfigured(),
    webhookConfigured: Boolean(
      process.env.KEYCAFE_WEBHOOK_USERNAME && process.env.KEYCAFE_WEBHOOK_PASSWORD,
    ),
    keycafeTimezone: process.env.KEYCAFE_TIMEZONE || "America/Phoenix",
    vehicleKeyStatuses,
    missingCount,
    lastCheckedAt,
    activeNav: "it-api-status",
  });
};

exports.testConnection = async (req, res) => {
  const result = await keycafe.testConnection();

  if (result.ok) {
    req.flash("success", `KeyCafe connection succeeded: ${result.detail}`);
  } else {
    req.flash("error", `KeyCafe connection failed: ${result.detail}`);
  }

  res.redirect("/it/api-status");
};

// Verifies every vehicle's KeyCafe key against KeyCafe's own key list. Only
// ever runs when an admin clicks the button below — never on page load —
// since it's a live external API call.
exports.checkVehicleAccess = async (req, res) => {
  if (!keycafe.isConfigured()) {
    req.flash("error", "KeyCafe isn't configured — set KEYCAFE_EMAIL/KEYCAFE_TOKEN first.");
    return res.redirect("/it/api-status");
  }

  try {
    const liveKeys = await keycafe.listKeys();
    const liveKeyIds = new Set(liveKeys.map((key) => String(key.id)));

    const vehicles = await Vehicle.findAll();
    const checkedAt = new Date();

    const vehiclesWithRealKeys = vehicles.filter((vehicle) =>
      isRealKeyCafeId(vehicle.keyCafeKeyId),
    );

    await Promise.all(
      vehiclesWithRealKeys.map((vehicle) => {
        vehicle.keyCafeAccessValid = liveKeyIds.has(String(vehicle.keyCafeKeyId));
        vehicle.keyCafeAccessCheckedAt = checkedAt;
        return vehicle.save();
      }),
    );

    const missing = vehiclesWithRealKeys.filter((vehicle) => !vehicle.keyCafeAccessValid);

    if (missing.length === 0) {
      req.flash(
        "success",
        `Checked KeyCafe: all ${vehiclesWithRealKeys.length} vehicle key(s) still exist there.`,
      );
    } else {
      req.flash(
        "error",
        `Checked KeyCafe: ${missing.length} vehicle key(s) no longer exist in KeyCafe — ` +
          `${missing.map((v) => `${v.make} ${v.model} (${v.licensePlate})`).join(", ")}. ` +
          "Recreate the KeyCafe key from each vehicle's page.",
      );
    }
  } catch (error) {
    console.error("Failed to check vehicle KeyCafe access:", error);
    req.flash("error", `Could not check KeyCafe access: ${error.message}`);
  }

  res.redirect("/it/api-status");
};
