const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const engine = require("ejs-mate");

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");

const app = express();

require("./db");

app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.use((req, res, next) => {
  if (req.path === "/vehicles" || req.path.startsWith("/vehicles/")) {
    res.locals.activeNav = "vehicles";
  } else if (
    req.path === "/account" ||
    req.path === "/login" ||
    req.path === "/register"
  ) {
    res.locals.activeNav = "account";
  }
  next();
});

app.use("/vehicles", vehicleRoutes);
app.use("/", userRoutes);

const port = process.env.PORT || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Serving on port ${port}`);
});
