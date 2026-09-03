const mongoose = require("mongoose");
const { Schema } = mongoose;

const activityLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: ["Login", "Logout", "RoleSwitch"],
      required: true,
    },
    detail: { type: String, default: "" },
    ip: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
