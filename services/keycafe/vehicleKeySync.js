const keycafe = require("./index");

function vehicleKeyName(vehicle) {
  return `${vehicle.year ? vehicle.year + " " : ""}${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`;
}

// A real KeyCafe key id is always a positive integer (what createKey/
// updateKey return) — the seed data's placeholders ("KC-TRANSIT-01") fail
// this check, which is exactly how we tell "still needs a real key" apart
// from "already fully set up in KeyCafe".
function isRealKeyCafeId(keyId) {
  const numericId = Number(keyId);
  return Number.isFinite(numericId) && numericId > 0;
}

// Idempotent create: a create-key call must never fire for a vehicle that
// already has a real key (callers enforce that), and this additionally
// reuses an existing same-named key if one is found, so even a double form
// submission or a retried request can't produce two keys for one vehicle.
// Returns null when KeyCafe isn't configured — callers fall back to a
// placeholder, matching this app's existing mock/dev-mode conventions.
async function ensureVehicleKey(vehicle) {
  if (!keycafe.isConfigured()) {
    return null;
  }

  const name = vehicleKeyName(vehicle);

  const existing = await keycafe.findKeyByName(name);
  if (existing) {
    return String(existing.id);
  }

  const created = await keycafe.createKey(name);
  return String(created.id);
}

// Best-effort rename of an already-real key to match the vehicle's current
// details. Never creates a key — silently does nothing if the vehicle
// doesn't have a real one yet (that's what ensureVehicleKey/the backfill
// action are for).
async function syncVehicleKeyName(vehicle) {
  if (!keycafe.isConfigured() || !isRealKeyCafeId(vehicle.keyCafeKeyId)) {
    return;
  }

  try {
    await keycafe.updateKey(vehicle.keyCafeKeyId, vehicleKeyName(vehicle));
  } catch (error) {
    console.error(`Failed to sync KeyCafe key name for vehicle ${vehicle._id}:`, error);
  }
}

module.exports = { isRealKeyCafeId, ensureVehicleKey, syncVehicleKeyName, vehicleKeyName };
