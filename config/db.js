require("dotenv").config();
const { Sequelize } = require("sequelize");

const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing database settings in environment: ${missing.join(", ")}`);
  process.exit(1);
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    // Store and read DATETIMEs as UTC so times don't shift depending on
    // whichever timezone the MySQL server happens to be configured with.
    timezone: "+00:00",
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      // createdAt/updatedAt on every table.
      timestamps: true,
    },
  },
);

// Resolves once the connection is verified; callers (app.js, seeds,
// scripts) await this before touching any model.
async function connect() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");
  } catch (err) {
    console.error("Failed to connect to MySQL:", err.message);
    process.exit(1);
  }
}

module.exports = { sequelize, connect };
