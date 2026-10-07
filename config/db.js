require("dotenv").config();
const { Sequelize } = require("sequelize");

const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing database settings in environment: ${missing.join(", ")}`);
  process.exit(1);
}

const flag = (value, fallback) => (value === undefined || value === "" ? fallback : value === "true");

// Microsoft SQL Server, via the tedious driver.
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  dialect: "mssql",
  dialectOptions: {
    options: {
      // Encrypted connections are SQL Server's default. A server using a
      // self-signed certificate (the local Docker container, or many
      // internal servers) also needs DB_TRUST_SERVER_CERTIFICATE=true.
      encrypt: flag(process.env.DB_ENCRYPT, true),
      trustServerCertificate: flag(process.env.DB_TRUST_SERVER_CERTIFICATE, false),
      // Read date-only (DATE) columns as local calendar dates. With tedious's
      // default (UTC) a stored 2026-10-01 comes back as the evening of
      // Sep 30 in Arizona. Timestamps are DATETIMEOFFSET, which carry their
      // own offset and aren't affected.
      useUTC: false,
      // Named instance (e.g. SQLEXPRESS) instead of a port, if the server uses one.
      ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {}),
    },
  },
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  define: {
    // createdAt/updatedAt on every table.
    timestamps: true,
  },
});

// Resolves once the connection is verified; callers (app.js, seeds,
// scripts) await this before touching any model.
async function connect() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");
  } catch (err) {
    console.error("Failed to connect to SQL Server:", err.message);
    process.exit(1);
  }
}

module.exports = { sequelize, connect };
