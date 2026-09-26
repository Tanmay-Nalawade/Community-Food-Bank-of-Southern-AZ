require("dotenv").config();
const { sequelize, connect } = require("../config/db");
const { User } = require("../models");

const VALID_ROLES = ["Staff", "Admin", "IT Admin"];

async function main() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error("Usage: node scripts/promote-user.js <email> <role>");
    console.error(`Role must be one of: ${VALID_ROLES.join(", ")}`);
    console.error('Example: node scripts/promote-user.js jane.doe@communityfoodbank.org "IT Admin"');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Role must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  await connect();

  // The account must already exist — this script only changes a role, it
  // never creates a login. Sign up normally first (with a real
  // @communityfoodbank.org email) and verify the email, then run this.
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (!user) {
    console.error(`No account found for ${email}.`);
    console.error("They need to sign up and verify their email first, then re-run this script.");
    await sequelize.close();
    process.exit(1);
  }

  user.role = role;
  await user.save();

  console.log(`${user.firstName} ${user.lastName} (${user.email}) is now: ${role}`);

  await sequelize.close();
}

main().catch((err) => {
  console.error("Failed to update role:", err.message);
  process.exit(1);
});
