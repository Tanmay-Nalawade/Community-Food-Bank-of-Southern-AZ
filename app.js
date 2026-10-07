const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const flash = require("connect-flash");
const helmet = require("helmet");
const engine = require("ejs-mate");

const userRoutes = require("./routes/user");
const vehicleRoutes = require("./routes/vehicle");
const adminRoutes = require("./routes/admin");
const reservationRoutes = require("./routes/reservation");
const webhookRoutes = require("./routes/webhook");
const accountRoutes = require("./routes/account");
const itRoutes = require("./routes/it");
const reminderScheduler = require("./jobs/reminderScheduler");
const passport = require("./config/passport");
const { computeEffectiveRole } = require("./middleware/auth");
const { Reservation } = require("./models");
const { connect } = require("./config/db");
const migrator = require("./config/migrator");

const app = express();

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
app.locals.fmt = require("./utils/formatDate");

// Which page-specific CSS bundle to load (see views/layouts/boilerplate.ejs).
// Set this before anything that can fail (sessions, passport, DB lookups) —
// it only depends on req.path, so it must never be the reason an error page
// itself fails to render.
app.use((req, res, next) => {
  res.locals.isAdminSection = req.path.startsWith("/admin") || req.path.startsWith("/it");
  next();
});

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

// Every static asset URL carries ?v=<this> (see views/layouts/boilerplate.ejs
// and asset() below) so a year-long, "immutable" cache is safe: the moment
// the app restarts (any deploy), the version changes and every page starts
// requesting fresh URLs — old cached files are simply never asked for again,
// rather than needing to expire or be re-validated. In dev, no caching at
// all so CSS/JS edits show up on a normal refresh, not just a hard one.
const ASSET_VERSION = String(Date.now());
app.locals.asset = (assetPath) => `${assetPath}?v=${ASSET_VERSION}`;

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1y" : 0,
    immutable: process.env.NODE_ENV === "production",
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cfb-motor-pool-dev-secret",
    resave: false,
    saveUninitialized: false,
    store: new MySQLStore({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // The `sessions` table is created by the initial-schema migration.
      createDatabaseTable: false,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 14 * 24 * 60 * 60 * 1000,
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

// Global, unmissable prompt for a compulsory END odometer reading — a
// safety net for a trip completed via KeyCafe's own hardware without ever
// visiting the "Return Vehicle" page. There's no start prompt: a trip's
// start reading is filled in automatically from the vehicle's odometer
// (services/odometer.js). See views/layouts/boilerplate.ejs for the dialog.
app.use(async (req, res, next) => {
  res.locals.mandatoryOdometerPrompt = null;
  if (!res.locals.currentUser) {
    return next();
  }

  try {
    const needsEnd = await Reservation.findOne({
      where: { userId: res.locals.currentUser.id, status: "Completed", endMileage: null },
      include: [{ association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] }],
      order: [["tripEndedAt", "DESC"]],
    });

    if (needsEnd) {
      res.locals.mandatoryOdometerPrompt = { type: "end", reservation: needsEnd };
    }
  } catch (error) {
    console.error("Failed to check mandatory odometer prompt:", error);
  }

  next();
});

app.use((req, res, next) => {
  res.locals.successMessages = req.flash("success");
  res.locals.errorMessages = req.flash("error");
  next();
});

app.use((req, res, next) => {
  if (req.path === "/vehicles/all") {
    res.locals.activeNav = "all-vehicles";
  } else if (
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
  } else if (req.path.startsWith("/admin/dashboard")) {
    res.locals.activeNav = "admin-dashboard";
  } else if (req.path.startsWith("/admin/reservations")) {
    res.locals.activeNav = "admin-reservations";
  } else if (req.path.startsWith("/admin/vehicles")) {
    res.locals.activeNav = "admin-vehicles";
  } else if (req.path.startsWith("/admin/drivers")) {
    res.locals.activeNav = "admin-drivers";
  } else if (req.path.startsWith("/admin/issues")) {
    res.locals.activeNav = "admin-issues";
  } else if (req.path.startsWith("/admin/reports")) {
    res.locals.activeNav = "admin-reports";
  } else if (req.path.startsWith("/admin")) {
    res.locals.activeNav = "admin";
  } else if (req.path.startsWith("/it/users")) {
    res.locals.activeNav = "it-users";
  } else if (req.path.startsWith("/it/activity")) {
    res.locals.activeNav = "it-activity";
  } else if (req.path.startsWith("/it/api-status")) {
    res.locals.activeNav = "it-api-status";
  } else if (req.path.startsWith("/it/notifications")) {
    res.locals.activeNav = "it-notifications";
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

  if (err.name === "SequelizeValidationError") {
    status = 400;
    message = err.errors.map((fieldError) => fieldError.message).join(" ");
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

// Only start serving (and running the schedulers, which query the DB) once
// the database is reachable and its schema is current — a missing
// migration would otherwise surface as confusing "unknown column" errors
// on whichever page happened to need it first.
async function start() {
  await connect();

  const pending = await migrator.pending();
  if (pending.length) {
    console.error(
      `FATAL: ${pending.length} database migration(s) pending ` +
        `(${pending.map((m) => m.name).join(", ")}). Run \`npm run db:migrate\` first.`,
    );
    process.exit(1);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Serving on port ${port}`);
  });

  reminderScheduler.start();
}

start();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception, shutting down:", err);
  process.exit(1);
});
