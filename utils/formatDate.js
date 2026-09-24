// One place for how dates and times read across the app's pages, so every
// table and detail view says "Sep 20, 2026, 8:00 AM" instead of a mix of
// locale defaults (which include seconds). Exposed to all views as `fmt`.
const LOCALE = "en-US";

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTime(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleString(LOCALE, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
}

function date(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" }) : "";
}

function time(value) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" }) : "";
}

// "Sep 20, 2026, 8:00 AM to 5:00 PM" when both ends fall on the same day,
// otherwise both full date-times.
function range(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return "";
  return s.toDateString() === e.toDateString()
    ? `${dateTime(s)} to ${time(e)}`
    : `${dateTime(s)} to ${dateTime(e)}`;
}

module.exports = { dateTime, date, time, range };
