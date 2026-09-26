const { VehicleIssue } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");

// All issues across all vehicles, unreviewed first, newest first within
// each group.
async function fetchIssues(skip, limit) {
  const issues = await VehicleIssue.findAll({
    include: [
      { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] },
      { association: "reportedBy", attributes: ["id", "firstName", "lastName"] },
    ],
    order: [["reviewed", "ASC"], ["reportedAt", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
  return issues.map((issue) => ({ vehicle: issue.vehicle, issue }));
}

exports.index = async (req, res) => {
  const { items: issues, hasMore, nextSkip } = await fetchPage(fetchIssues, 0);

  res.render("admin/issues/index", {
    title: "Vehicle Issues",
    issues,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-issues",
  });
};

exports.more = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: issues, hasMore } = await fetchPage(fetchIssues, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/issues/_rows", { issues });
};

function findIssue(req) {
  return VehicleIssue.findOne({
    where: { id: req.params.issueId, vehicleId: req.params.vehicleId },
  });
}

exports.markReviewed = async (req, res) => {
  const issue = await findIssue(req);

  if (!issue) {
    return renderError(res, 404, "Issue not found.");
  }

  issue.reviewed = true;
  issue.reviewedById = res.locals.currentUser.id;
  issue.reviewedAt = new Date();
  await issue.save();

  req.flash("success", "Issue marked as reviewed.");
  res.redirect("/admin/issues");
};

exports.dismiss = async (req, res) => {
  await VehicleIssue.destroy({
    where: { id: req.params.issueId, vehicleId: req.params.vehicleId },
  });

  req.flash("success", "Issue removed.");
  res.redirect("/admin/issues");
};
