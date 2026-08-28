const keycafe = require("./keycafe");

async function grantReservationAccess(reservation) {
  const user = reservation.userId;
  const vehicle = reservation.vehicleId;

  if (!user?.email) {
    throw new Error("Reservation user email is required for KeyCafe access.");
  }

  if (!vehicle?.keyCafeKeyId) {
    throw new Error("Vehicle KeyCafe key ID is required.");
  }

  if (reservation.keyCafeAccess?.accessId) {
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

  reservation.keyCafeAccess = {
    bookingCode: String(access.bookingCode),
    accessId: String(access.id),
    checkinLink: access.checkinLink || "",
    keyPickedUpAt: reservation.keyCafeAccess?.keyPickedUpAt,
    keyReturnedAt: reservation.keyCafeAccess?.keyReturnedAt,
  };

  return reservation;
}

async function revokeReservationAccess(reservation) {
  const accessId = reservation.keyCafeAccess?.accessId;

  if (!accessId) {
    return reservation;
  }

  await keycafe.cancelAccess(accessId);

  reservation.keyCafeAccess.bookingCode = undefined;
  reservation.keyCafeAccess.accessId = undefined;
  reservation.keyCafeAccess.checkinLink = undefined;

  return reservation;
}

module.exports = {
  grantReservationAccess,
  revokeReservationAccess,
};
