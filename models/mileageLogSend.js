const mongoose = require("mongoose");
const { Schema } = mongoose;

const mileageLogSendSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    sentAt: { type: Date, default: Date.now },
    recipient: { type: String },
  },
  { timestamps: true },
);

mileageLogSendSchema.index({ vehicleId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("MileageLogSend", mileageLogSendSchema);
