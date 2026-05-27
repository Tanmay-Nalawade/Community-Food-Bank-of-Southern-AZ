const mongoose = require("mongoose");
const { Schema } = mongoose;

const vehicleSchema = new Schema(
  {
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number },
    licensePlate: { type: String, required: true, unique: true },

    keyCafeKeyId: { type: String, required: true },

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
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
