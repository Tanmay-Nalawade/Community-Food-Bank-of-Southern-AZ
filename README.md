# Community Food Bank of Southern Arizona — Motor Pool

Internal vehicle-reservation app for the food bank's motor pool. Staff book shared vehicles,
pick up/return keys via a KeyCafe smart lockbox, and report mileage/issues after a trip. Admins
manage the fleet, reservations, and drivers; IT Admins manage accounts and the KeyCafe
integration's health.

## Running it locally

The app uses MySQL (8.4). Nothing needs to be installed on your machine besides Docker — the
database runs in a container defined in `docker-compose.yml`.

1. Copy `.env.example` to `.env` and fill in the `DB_*` values (any passwords you like — the
   container is created with them the first time it starts) plus whatever else you have
   (KeyCafe/SMTP/etc. all have safe mock fallbacks when unset — see the comments in that file).
2. `docker compose up --build` — starts MySQL, applies any pending schema migrations, and runs the
   app with nodemon at http://localhost:8080.
3. `docker compose exec app npm run seed` to load demo accounts/vehicles/bookings (prints the login
   credentials it created). **This wipes every table first.**

Prefer running Node on the host? `docker compose up -d mysql`, then `npm install`,
`npm run db:migrate`, `npm run dev` — with `DB_HOST=127.0.0.1` and `DB_PORT` set to the
container's published port. If something else on your machine already uses 3306 (e.g. a Homebrew
MySQL), set `DB_PORT=3307` in `.env`; compose publishes the container on that port instead.

After changing dependencies in `package.json`, recreate the app container's `node_modules`
volume or it will keep running with the old packages: `docker compose up --build -V`.

### Database schema and migrations

The schema lives in versioned migrations under `migrations/` (run with
[umzug](https://github.com/sequelize/umzug); applied ones are recorded in the `schema_migrations`
table). The app refuses to start while a migration is pending, so a new deployment is always:

```
npm run db:migrate            # apply pending migrations
npm run db:migrate -- status  # show applied / pending
npm run db:migrate -- down    # roll back the most recent one
```

To change the schema, add a new file to `migrations/` (never edit one that has already run
somewhere) and update the matching model in `models/`.

## Folder structure

```
app.js                      Entry point: Express setup, session/auth wiring, route mounting
config/
  db.js                     MySQL connection (Sequelize)
  migrator.js               Migration runner used by scripts/migrate.js and the startup check
  passport.js                Passport local-strategy + session (de)serialization
controllers/                 Route handler logic
  account.js, reservation.js, user.js, vehicle.js, webhook.js   Staff-facing / shared
  admin/                      Fleet-manager (Admin role) features
    dashboard.js, driver.js, issue.js, mileageLog.js, report.js, reservation.js, trip.js, vehicle.js
  it/                         IT Admin features
    activity.js, apiStatus.js, user.js
jobs/                        Background schedulers, started once from app.js
  reminderScheduler.js        Upcoming-booking reminder emails
middleware/                   Express middleware
  auth.js                     Login/role guards, "view as" role computation
  validate.js                 Generic Joi-validate-body middleware factory
  keycafeWebhookAuth.js        HTTP Basic auth check for the KeyCafe webhook
migrations/                   Versioned MySQL schema changes, applied in filename order
models/                       Sequelize models, one file per table; index.js wires up associations
public/                       Static assets served as-is (css/, js/, fonts/, images/)
routes/                       Express routers, one per top-level URL mount in app.js
  account.js, admin.js, it.js, reservation.js, user.js, vehicle.js, webhook.js
scripts/                      One-off ops scripts (e.g. registering the KeyCafe webhook)
seeds/
  index.js                    Populates the database with demo users/vehicles/bookings
services/                     Integrations and business logic reused across controllers/jobs
  keycafe/                    KeyCafe smart-lockbox API
    index.js                  Low-level API client (mock fallback if unconfigured)
    reservationAccess.js      Grant/revoke key access for a specific reservation
  email/                      Outgoing email (console-logged if SMTP unconfigured)
    index.js                  Low-level sendEmail()
    reservationNotifications.js   Booking confirmation + reminder emails
    tripLogNotifications.js       Trip Log email, sent on demand from the Reports page
  mileageLog.js                Builds "vehicle X's log for month Y"; also the trip date-range filter
  odometer.js                  Start reading = vehicle odometer; end readings advance it
utils/                        Small framework-agnostic helpers
validators/                   Joi request-body schemas, one file per resource
  user.js, vehicle.js, reservation.js   General schemas
  admin/reservation.js                  Admin-only edit/deny schema (mirrors controllers/admin/)
views/                        EJS templates, mirroring the routes/controllers structure
  admin/, it/, account/, reservations/, users/, vehicles/   Feature areas
  emails/                      Templates rendered into outgoing emails
  errors/, layouts/, partials/  Shared chrome
```

**How a request flows:** `app.js` mounts a router from `routes/` for each URL prefix (`/admin`,
`/it`, `/reservations`, `/vehicles`, `/account`, `/webhooks`, `/`) → the router applies
`middleware/` (login/role checks, then body validation against a `validators/` schema) → the
matching function in `controllers/` (or `controllers/admin/`, `controllers/it/` for those
areas) runs, using `models/` (required via `models/index.js`) to talk to MySQL and `services/` for KeyCafe/email → a template
under `views/` renders the response. `jobs/` run independently of any request, on a timer
started once at boot.

**Why `admin/` and `it/` subfolders under `controllers/`:** those two areas alone accounted for
11 of the 16 controller files, all flat and prefix-named (`adminVehicleController.js`,
`itUserController.js`, …). Nesting them by role area — and dropping the now-redundant
`admin`/`it`/`Controller` naming — makes it obvious at a glance which features belong to which
role, matching how `views/admin/` and `views/it/` were already organized.

**Why `services/keycafe/` and `services/email/`:** `services/` had 6 files mixing two unrelated
integrations. Splitting into per-integration folders (with the low-level client at each folder's
`index.js`, so nothing outside `services/` needed to change how it requires the module) groups
what's actually related.

**Why `routes/account.js` instead of `routes/accountRoutes.js`, `validators/user.js` instead of
`validators/userSchemas.js`:** same reasoning as `controllers/` — inside a folder already named
`routes/`/`validators/`, a `Routes`/`Schemas` suffix on every file just repeats the folder name.
`validators/admin/reservation.js` mirrors `controllers/admin/reservation.js` for the same
admin-only-schema reason the controller got nested. `seeds/seed.js` became `seeds/index.js` to
match how every other single-entry-point folder in this repo (`services/keycafe/`,
`services/email/`) names its main file.
