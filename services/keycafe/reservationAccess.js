const keycafe = require("./index");
const { AccessLog } = require("../../models");

// Sets the reservation's keyCafe* fields in memory (callers save it) and
// records the grant in the access log. `user` and `vehicle` are passed in
// explicitly — the driver and the vehicle the access should be scoped to,
// which during an admin vehicle change is the NEW vehicle, not whatever the
// reservation row still points at.
async function grantReservationAccess(reservation, user, vehicle) {
  if (!user?.email) {
    throw new Error("Reservation user email is required for KeyCafe access.");
  }

  if (!vehicle?.keyCafeKeyId) {
    throw new Error("Vehicle KeyCafe key ID is required.");
  }

  if (reservation.keyCafeAccessId) {
    return reservation;
  }

  const guestName = `${user.firstName} ${user.lastName}`.trim();
  const access = await keycafe.createAccess({
    user,
    vehicle,
    startTime: reservation.requestedStartTime,
    endTime: reservation.requestedEndTime,
    guestName,
  });

  reservation.keyCafeBookingCode = String(access.bookingCode);
  reservation.keyCafeAccessId = String(access.id);
  reservation.keyCafeCheckinLink = access.checkinLink || "";

  await AccessLog.create({
    reservationId: reservation.id,
    vehicleId: vehicle.id,
    userId: user.id,
    action: "Granted",
    accessId: reservation.keyCafeAccessId,
    bookingCode: reservation.keyCafeBookingCode,
  });

  return reservation;
}

async function revokeReservationAccess(reservation) {
  const accessId = reservation.keyCafeAccessId;

  if (!accessId) {
    return reservation;
  }

  await keycafe.cancelAccess(accessId);

  await AccessLog.create({
    reservationId: reservation.id,
    vehicleId: reservation.vehicleId,
    userId: reservation.userId,
    action: "Revoked",
    accessId,
    bookingCode: reservation.keyCafeBookingCode,
  });

  reservation.keyCafeBookingCode = null;
  reservation.keyCafeAccessId = null;
  reservation.keyCafeCheckinLink = null;

  return reservation;
}

module.exports = {
  grantReservationAccess,
  revokeReservationAccess,
};
