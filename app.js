const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const session = require("express-session");
const flash = require("connect-flash");
const engine = require("ejs-mate");

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const accountRoutes = require("./routes/accountRoutes");
const itRoutes = require("./routes/itRoutes");
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
app.use(flash());
app.use(loadCurrentUser);

app.use((req, res, next) => {
  res.locals.successMessages = req.flash("success");
  res.locals.errorMessages = req.flash("error");
  next();
});

app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path === "/vehicles" ||
    req.path.startsWith("/vehicles/")
  ) {
    res.locals.activeNav = "vehicles";
  } else if (
    req.path === "/login" ||
    req.path === "/register"
  ) {
    res.locals.activeNav = "account";
  } else if (req.path.startsWith("/reservations")) {
    res.locals.activeNav = "dashboard";
  } else if (req.path.startsWith("/admin")) {
    res.locals.activeNav = "admin";
  } else if (req.path.startsWith("/it")) {
    res.locals.activeNav = "it";
  }
  next();
});

app.use("/admin", adminRoutes);
app.use("/reservations", reservationRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/account", accountRoutes);
app.use("/it", itRoutes);
app.use("/", userRoutes);

const port = process.env.PORT || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Serving on port ${port}`);
});
