const path = require("path");
const { Umzug, SequelizeStorage } = require("umzug");
const { sequelize } = require("./db");

// Versioned schema changes live in migrations/ and are applied in filename
// order; the applied set is recorded in the `schema_migrations` table so
// each one runs exactly once per database.
const migrator = new Umzug({
  migrations: { glob: path.join(__dirname, "..", "migrations", "*.js").replace(/\\/g, "/") },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: "schema_migrations" }),
  logger: console,
});

module.exports = migrator;
