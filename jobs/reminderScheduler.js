const Reservation = require("../models/reservation");
const { sendReminder } = require("../services/reservationNotifications");

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FINAL_REMINDER_WINDOW_MS = 24 * HOUR_MS;
const THREE_DAY_REMINDER_WINDOW_MS = 72 * HOUR_MS;
const CONFIRMATION_COOLDOWN_MS = 3 * HOUR_MS;

// Caps a reservation at two reminders max (3-day + final), and skips a
// reminder entirely if the booking was only just confirmed — so a
// last-minute booking doesn't get a confirmation email immediately
// followed by a reminder email a few minutes later.
async function runCheck() {
  const now = new Date();

  let candidates;
  try {
    candidates = await Reservation.find({
      status: "Reserved",
      requestedStartTime: { $gt: now },
    })
      .populate("userId", "firstName lastName email")
      .populate("vehicleId", "make model year");
  } catch (error) {
    console.error("Reminder scheduler failed to load reservations:", error);
    return;
  }

  for (const reservation of candidates) {
    const msUntilStart = reservation.requestedStartTime.getTime() - now.getTime();
    const confirmationSentAt = reservation.notifications?.confirmationSentAt;
    const recentlyConfirmed =
      confirmationSentAt &&
      now.getTime() - new Date(confirmationSentAt).getTime() < CONFIRMATION_COOLDOWN_MS;

    if (recentlyConfirmed) {
      continue;
    }

    const finalAlreadySent = Boolean(reservation.notifications?.reminderFinalSentAt);
    const threeDayAlreadySent = Boolean(reservation.notifications?.reminder3DaySentAt);

    const needsFinalReminder = !finalAlreadySent && msUntilStart <= FINAL_REMINDER_WINDOW_MS;
    // Strictly the 24h-72h band — once we're inside the final window (or past
    // it), sending a "few days out" reminder no longer makes sense, even if
    // the final reminder was already sent in an earlier check.
    const needsThreeDayReminder =
      !threeDayAlreadySent &&
      !finalAlreadySent &&
      msUntilStart <= THREE_DAY_REMINDER_WINDOW_MS &&
      msUntilStart > FINAL_REMINDER_WINDOW_MS;

    if (needsFinalReminder) {
      await sendReminder(reservation, "final");
    } else if (needsThreeDayReminder) {
      await sendReminder(reservation, "threeDay");
    }
  }
}

function start() {
  runCheck();
  return setInterval(runCheck, CHECK_INTERVAL_MS);
}

module.exports = { start, runCheck };
