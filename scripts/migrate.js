// Usage:
//   npm run db:migrate            apply every pending migration
//   npm run db:migrate -- status  list applied / pending migrations
//   npm run db:migrate -- down    roll back the most recent migration
const { sequelize, connect } = require("../config/db");
const migrator = require("../config/migrator");

async function main() {
  const command = process.argv[2] || "up";
  await connect();

  if (command === "up") {
    const applied = await migrator.up();
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Database is up to date.");
  } else if (command === "down") {
    const reverted = await migrator.down();
    console.log(reverted.length ? `Reverted ${reverted[0].name}.` : "Nothing to revert.");
  } else if (command === "status") {
    const [executed, pending] = await Promise.all([migrator.executed(), migrator.pending()]);
    executed.forEach((m) => console.log(`  applied  ${m.name}`));
    pending.forEach((m) => console.log(`  pending  ${m.name}`));
  } else {
    console.error(`Unknown command "${command}". Use up, down, or status.`);
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
