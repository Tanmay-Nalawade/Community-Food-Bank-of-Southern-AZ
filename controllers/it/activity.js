const ActivityLog = require("../../models/activityLog");

const PAGE_SIZE = 10;
const MAX_LOGS = 200;

function fetchLogs(skip, limit) {
  return ActivityLog.find({})
    .populate("userId", "firstName lastName email role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

exports.index = async (req, res) => {
  // Fetch one extra row so we can tell whether a "Load more" button is
  // needed without a separate count query.
  const probe = await fetchLogs(0, PAGE_SIZE + 1);
  const hasMore = probe.length > PAGE_SIZE;
  const logs = probe.slice(0, PAGE_SIZE);

  res.render("it/activity/index", {
    title: "Activity Log",
    logs,
    hasMore,
    nextSkip: PAGE_SIZE,
    pageSize: PAGE_SIZE,
    activeNav: "it-activity",
  });
};

// Returns just the next batch of rows as an HTML fragment (for the "Load
// more" button's fetch() call), plus an X-Has-More header so the client
// knows whether to keep offering another batch.
exports.more = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const remaining = Math.max(0, MAX_LOGS - skip);

  if (remaining <= 0) {
    res.set("X-Has-More", "0");
    return res.send("");
  }

  const probe = await fetchLogs(skip, Math.min(PAGE_SIZE + 1, remaining));
  const hasMore = probe.length > PAGE_SIZE;
  const logs = probe.slice(0, PAGE_SIZE);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("it/activity/_rows", { logs });
};
