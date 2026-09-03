const mongoose = require("mongoose");
const { Schema } = mongoose;

const accessLogSchema = new Schema(
  {
    reservationId: { type: Schema.Types.ObjectId, ref: "Reservation", required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: ["Granted", "Revoked", "PickedUp", "Returned"],
      required: true,
    },
    accessId: { type: String },
    bookingCode: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AccessLog", accessLogSchema);
