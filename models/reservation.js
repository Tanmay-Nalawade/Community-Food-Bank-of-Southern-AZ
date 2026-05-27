const mongoose = require("mongoose");
const { Schema } = mongoose;

const reservationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },

    requestedStartTime: { type: Date, required: true },
    requestedEndTime: { type: Date, required: true },

    status: {
      type: String,
      enum: ["Reserved", "Active", "Completed", "Cancelled"],
      default: "Reserved",
    },

    keyCafeAccess: {
      pinCode: { type: String },
      accessId: { type: String },
      keyPickedUpAt: { type: Date },
      keyReturnedAt: { type: Date },
    },

    tripLog: {
      tripStartedAt: { type: Date },
      tripEndedAt: { type: Date },
      startMileage: { type: Number },
      endMileage: { type: Number },
      issuesReported: { type: String, default: null },
    },
  },
  { timestamps: true },
);

reservationSchema.index({
  vehicleId: 1,
  requestedStartTime: 1,
  requestedEndTime: 1,
});

module.exports = mongoose.model("Reservation", reservationSchema);
