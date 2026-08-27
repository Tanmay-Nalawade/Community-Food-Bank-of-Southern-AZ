const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const session = require("express-session");
const engine = require("ejs-mate");

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const { loadCurrentUser } = require("./middleware/auth");

const app = express();

require("./db");

app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cfb-motor-pool-dev-secret",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(loadCurrentUser);

app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path === "/vehicles" ||
    req.path.startsWith("/vehicles/")
  ) {
    res.locals.activeNav = "vehicles";
  } else if (
    req.path === "/account" ||
    req.path === "/login" ||
    req.path === "/register" ||
    req.path.startsWith("/reservations")
  ) {
    res.locals.activeNav = "account";
  } else if (req.path.startsWith("/admin")) {
    res.locals.activeNav = "admin";
  }
  next();
});

app.use("/admin", adminRoutes);
app.use("/reservations", reservationRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/", userRoutes);

const port = process.env.PORT || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Serving on port ${port}`);
});
