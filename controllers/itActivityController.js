const ActivityLog = require("../models/activityLog");

exports.index = async (req, res) => {
  const logs = await ActivityLog.find({})
    .populate("userId", "firstName lastName email role")
    .sort({ createdAt: -1 })
    .limit(200);

  res.render("it/activity/index", {
    title: "Activity Log",
    logs,
    activeNav: "it",
  });
};
