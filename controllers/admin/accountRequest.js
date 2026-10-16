const { User } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { sendAccountApprovedEmail } = require("../../services/email/accountNotifications");

// Only accounts that have verified their email are shown: until then the
// person hasn't proven they own the address, and they couldn't log in anyway.
const PENDING = { isApproved: false, emailVerified: true };

async function findPendingAccount(id) {
  return User.findOne({ where: { id, ...PENDING } });
}

exports.index = async (req, res) => {
  const accounts = await User.findAll({
    where: PENDING,
    order: [["createdAt", "ASC"], ["id", "ASC"]],
  });

  res.render("admin/account-requests/index", {
    title: "Account Requests",
    accounts,
    activeNav: "admin-account-requests",
  });
};

exports.approve = async (req, res) => {
  const account = await findPendingAccount(req.params.id);
  if (!account) {
    return renderError(res, 404, "Account request not found — it may already have been handled.");
  }

  account.isApproved = true;
  account.approvedAt = new Date();
  account.approvedById = res.locals.currentUser.id;
  await account.save();

  try {
    await sendAccountApprovedEmail(account);
  } catch (error) {
    console.error(`Failed to send account-approved email to user ${account.id}:`, error);
  }

  req.flash("success", `${account.firstName} ${account.lastName} can now log in.`);
  res.redirect("/admin/account-requests");
};

// Removes the request entirely (a pending account has no bookings or logs
// yet), so the person can sign up again later if it was declined by mistake.
exports.decline = async (req, res) => {
  const account = await findPendingAccount(req.params.id);
  if (!account) {
    return renderError(res, 404, "Account request not found — it may already have been handled.");
  }

  await account.destroy();

  req.flash("success", `Declined the account request from ${account.firstName} ${account.lastName}.`);
  res.redirect("/admin/account-requests");
};
