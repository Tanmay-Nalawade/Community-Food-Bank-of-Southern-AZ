const mongoose = require("mongoose");
const { Schema } = mongoose;

const vehicleSchema = new Schema(
  {
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number },
    licensePlate: { type: String, required: true, unique: true },

    keyCafeKeyId: { type: String, required: true },

    photoUrl: { type: String, default: "" },

    currentMileage: { type: Number, required: true, default: 0 },

    status: {
      type: String,
      enum: [
        "Available",
        "Reserved",
        "In Use",
        "Maintenance",
        "Out of Service",
      ],
      default: "Available",
    },

    activeIssues: [
      {
        reportedAt: { type: Date, default: Date.now },
        description: { type: String },
        reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reservationId: { type: Schema.Types.ObjectId, ref: "Reservation" },
        reviewed: { type: Boolean, default: false },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reviewedAt: { type: Date },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
