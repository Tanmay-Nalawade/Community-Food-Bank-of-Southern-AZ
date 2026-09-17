const BASE_URL = "https://www.keycafe.com/v0";

function isConfigured() {
  return Boolean(process.env.KEYCAFE_EMAIL && process.env.KEYCAFE_TOKEN);
}

// KeyCafe supports two non-interchangeable Basic Auth schemes for the same
// KEYCAFE_TOKEN value: the newer "API Token" (username "{email}/token") and
// the older, still-commonly-issued "API Key" (username "{email}/key", per
// KeyCafe's dashboard — despite their docs calling it deprecated in favor of
// tokens). Sending the wrong suffix for what you actually have fails with a
// 401 even though the credential itself is valid. Default to "token" (the
// recommended scheme) but let KEYCAFE_AUTH_TYPE=key override it for accounts
// that only have a Key.
function getAuthHeader() {
  const email = process.env.KEYCAFE_EMAIL;
  const token = process.env.KEYCAFE_TOKEN;
  const authType = (process.env.KEYCAFE_AUTH_TYPE || "token").toLowerCase();
  const credentials = Buffer.from(`${email}/${authType}:${token}`).toString("base64");
  return `Basic ${credentials}`;
}

async function request(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `KeyCafe API ${method} ${path} failed (${response.status}): ${errorBody}`,
    );
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function formatDateTime(date, timeZone) {
  return {
    date: date.toLocaleDateString("en-CA", { timeZone }),
    time: date.toLocaleTimeString("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function buildKeyPayload(keyCafeKeyId) {
  const numericId = Number(keyCafeKeyId);
  if (Number.isFinite(numericId) && numericId > 0) {
    return { id: numericId };
  }

  return { serialNumber: keyCafeKeyId };
}

function createMockAccess() {
  return {
    id: `mock-${Date.now()}`,
    bookingCode: String(Math.floor(10000000 + Math.random() * 90000000)),
    checkinLink: "",
    mock: true,
  };
}

async function createAccess({ user, vehicle, startTime, endTime, guestName }) {
  const timeZone = process.env.KEYCAFE_TIMEZONE || "America/Phoenix";

  if (!isConfigured()) {
    return createMockAccess();
  }

  const start = formatDateTime(startTime, timeZone);
  const end = formatDateTime(endTime, timeZone);

  return request("POST", "/access", {
    user: { email: user.email },
    key: buildKeyPayload(vehicle.keyCafeKeyId),
    accessStartDate: start.date,
    accessStartTime: start.time,
    accessEndDate: end.date,
    accessEndTime: end.time,
    timeZone,
    name: guestName,
    returnReminder: true,
    suppressGuestNotifications: true,
    locale: "en",
    allowSetup: false,
  });
}

async function cancelAccess(accessId) {
  if (!accessId || String(accessId).startsWith("mock-")) {
    return;
  }

  if (!isConfigured()) {
    return;
  }

  return request("DELETE", `/access/${accessId}`);
}

async function createWebhook(url, username, password) {
  if (!isConfigured()) {
    throw new Error("KEYCAFE_EMAIL and KEYCAFE_TOKEN must be set to register a webhook.");
  }

  return request("POST", "/webhook", { url, username, password });
}

async function createKey(name) {
  return request("POST", "/key", { name });
}

async function updateKey(keyId, name) {
  return request("PUT", `/key/${keyId}`, { name });
}

async function findKeyByName(name) {
  const keys = await request("GET", `/key?query=${encodeURIComponent(name)}`);
  return Array.isArray(keys) ? keys.find((key) => key.name === name) || null : null;
}

async function testConnection() {
  if (!isConfigured()) {
    return { ok: false, detail: "KEYCAFE_EMAIL and KEYCAFE_TOKEN are not set." };
  }

  try {
    const keys = await request("GET", "/key");
    const count = Array.isArray(keys) ? keys.length : 0;
    return { ok: true, detail: `Authenticated successfully, found ${count} key(s).` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

module.exports = {
  isConfigured,
  createAccess,
  cancelAccess,
  createWebhook,
  createKey,
  updateKey,
  findKeyByName,
  testConnection,
};
