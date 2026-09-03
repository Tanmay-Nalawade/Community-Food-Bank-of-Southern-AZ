const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const flash = require("connect-flash");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const engine = require("ejs-mate");

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const accountRoutes = require("./routes/accountRoutes");
const itRoutes = require("./routes/itRoutes");
const reminderScheduler = require("./jobs/reminderScheduler");
const passport = require("./config/passport");
const { computeEffectiveRole } = require("./middleware/auth");

const app = express();

require("./db");

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error(
    "FATAL: SESSION_SECRET is not set. Refusing to start in production with the default " +
      "secret, since that would let anyone forge session cookies. Set SESSION_SECRET in the environment.",
  );
  process.exit(1);
}

app.set("trust proxy", 1);

app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(methodOverride("_method"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cfb-motor-pool-dev-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_DB_URL,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});
app.use(computeEffectiveRole);

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

app.use((req, res) => {
  res.status(404);
  res.render("errors/error", {
    title: "Page Not Found",
    status: 404,
    message: "The page you're looking for doesn't exist.",
    activeNav: null,
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (req.originalUrl.startsWith("/webhooks/")) {
    return res.status(err.status || 500).send("Server error");
  }

  let status = err.status || 500;
  let message = "Something went wrong on our end. Please try again.";

  if (err.name === "CastError") {
    status = 400;
    message = "That link looks invalid or malformed.";
  } else if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors)
      .map((fieldError) => fieldError.message)
      .join(" ");
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "That request could not be understood.";
  }

  res.status(status);
  res.render("errors/error", {
    title: status === 400 ? "Invalid Request" : "Something Went Wrong",
    status,
    message,
    activeNav: null,
  });
});

const port = process.env.PORT || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Serving on port ${port}`);
});

reminderScheduler.start();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception, shutting down:", err);
  process.exit(1);
});
