const BASE_URL = "https://www.keycafe.com/v0";

function isConfigured() {
  return Boolean(process.env.KEYCAFE_EMAIL && process.env.KEYCAFE_TOKEN);
}

function getAuthHeader() {
  const email = process.env.KEYCAFE_EMAIL;
  const token = process.env.KEYCAFE_TOKEN;
  const credentials = Buffer.from(`${email}/token:${token}`).toString("base64");
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

  if (response.status === 204) {
    return null;
  }

  return response.json();
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

module.exports = {
  isConfigured,
  createAccess,
  cancelAccess,
};
