require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");

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

  if (!process.env.MONGO_DB_URL) {
    console.error("MONGO_DB_URL is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  // The account must already exist — this script only changes a role, it
  // never creates a login. Sign up normally first (with a real
  // @communityfoodbank.org email) and verify the email, then run this.
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    console.error(`No account found for ${email}.`);
    console.error("They need to sign up and verify their email first, then re-run this script.");
    await mongoose.disconnect();
    process.exit(1);
  }

  user.role = role;
  await user.save();

  console.log(`${user.firstName} ${user.lastName} (${user.email}) is now: ${role}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed to update role:", err.message);
  process.exit(1);
});
