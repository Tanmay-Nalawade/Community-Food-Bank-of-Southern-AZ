require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_DB_URL).catch((err) => {
  console.error("Failed to connect to MongoDB:", err.message);
  process.exit(1);
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected");
});

module.exports = mongoose;
