const mongoose = require("mongoose");
const { Schema } = mongoose;

const vehicleSchema = new Schema(
  {
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number },
    // uppercase+trim so "abc-1234" and "ABC-1234" collide as the same plate
    // instead of slipping past the unique index as two "different" vehicles.
    licensePlate: { type: String, required: true, unique: true, uppercase: true, trim: true },

    keyCafeKeyId: { type: String, required: true },

    // Only set when an admin runs "Check KeyCafe Access" on the API Status
    // page — a live lookup against KeyCafe's own key list. Never refreshed
    // automatically (that would mean an external API call on every page
    // load), so this can go stale if the key is later deleted in KeyCafe.
    keyCafeAccessValid: { type: Boolean },
    keyCafeAccessCheckedAt: { type: Date },

    photoUrl: { type: String, default: "" },

    currentMileage: { type: Number, required: true, default: 0 },

    nextMaintenanceDueMileage: { type: Number },
    nextMaintenanceDueDate: { type: Date },

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
