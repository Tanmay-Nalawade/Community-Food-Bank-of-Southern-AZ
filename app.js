const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const session = require("express-session");
const flash = require("connect-flash");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const engine = require("ejs-mate");

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const { loadCurrentUser } = require("./middleware/auth");
const { asyncHandler } = require("./utils/asyncHandler");
const reminderScheduler = require("./jobs/reminderScheduler");

const app = express();

require("./db");

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.warn(
    "WARNING: SESSION_SECRET is not set. Using an insecure default secret in production lets " +
      "anyone forge session cookies. Set SESSION_SECRET in the environment before going live.",
  );
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
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  }),
);
app.use(flash());
app.use(asyncHandler(loadCurrentUser));

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
  }
  next();
});

app.use("/admin", adminRoutes);
app.use("/reservations", reservationRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/webhooks", webhookRoutes);
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
