const Joi = require("joi");
const { NotificationSetting } = require("../models");

// Every notification email an IT Admin can route from the Notification
// Emails page (/it/notifications). Adding a new kind of notification = one
// entry here, plus a call to getRecipients("<key>") where the email is sent.
const NOTIFICATION_TYPES = [
  {
    key: "vehicleIssue",
    label: "Vehicle issue reported",
    description:
      "Sent whenever an issue is reported on a vehicle — by a driver (Report Issue), from the " +
      "defects ticked on a Return Vehicle inspection, or by an admin on the vehicle's page.",
  },
];

const TYPE_KEYS = NOTIFICATION_TYPES.map((type) => type.key);
const MAX_RECIPIENTS = 20;
const emailSchema = Joi.string().email({ tlds: { allow: false } }).max(255);

// Turns whatever an admin typed (commas, semicolons, spaces or new lines
// between addresses) into a clean, de-duplicated list. Returns
// { list } or { error } with a message naming the bad address.
function parseRecipients(input) {
  const list = [
    ...new Set(
      String(input || "")
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const invalid = list.find((email) => emailSchema.validate(email).error);
  if (invalid) {
    return { error: `"${invalid}" isn't a valid email address.` };
  }
  if (list.length > MAX_RECIPIENTS) {
    return { error: `Up to ${MAX_RECIPIENTS} addresses per notification.` };
  }
  return { list };
}

async function getRecipients(type) {
  const setting = await NotificationSetting.findOne({ where: { type } });
  return setting ? setting.recipientList : [];
}

// All types with their current recipients, for the settings page.
async function listSettings() {
  const rows = await NotificationSetting.findAll({
    where: { type: TYPE_KEYS },
    include: [{ association: "updatedBy", attributes: ["id", "firstName", "lastName"] }],
  });
  const byType = new Map(rows.map((row) => [row.type, row]));
  return NOTIFICATION_TYPES.map((type) => {
    const row = byType.get(type.key);
    return {
      ...type,
      recipients: row ? row.recipientList : [],
      updatedAt: row ? row.updatedAt : null,
      updatedBy: row ? row.updatedBy : null,
    };
  });
}

async function setRecipients(type, list, updatedById) {
  const [setting, created] = await NotificationSetting.findOrCreate({
    where: { type },
    defaults: { recipients: list.join(","), updatedById },
  });
  if (!created) {
    setting.recipients = list.join(",");
    setting.updatedById = updatedById;
    // Saved even when unchanged so "last updated by" reflects the save.
    setting.changed("updatedAt", true);
    await setting.save();
  }
  return setting;
}

module.exports = { NOTIFICATION_TYPES, TYPE_KEYS, parseRecipients, getRecipients, listSettings, setRecipients };
