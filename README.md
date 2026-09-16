# Community Food Bank of Southern Arizona — Motor Pool

Internal vehicle-reservation app for the food bank's motor pool. Staff book shared vehicles,
pick up/return keys via a KeyCafe smart lockbox, and report mileage/issues after a trip. Admins
manage the fleet, reservations, and drivers; IT Admins manage accounts and the KeyCafe
integration's health.

## Running it locally

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values you have (KeyCafe/SMTP/etc. all have
   safe mock fallbacks when unset — see the comments in that file).
3. `npm run dev` (nodemon) or `npm start`
4. `npm run seed` to load demo accounts/vehicles/bookings (prints the login credentials it created).

## Folder structure

```
app.js                      Entry point: Express setup, session/auth wiring, route mounting
config/
  db.js                     MongoDB connection
  passport.js                Passport local-strategy + session (de)serialization
controllers/                 Route handler logic
  account.js, reservation.js, user.js, vehicle.js, webhook.js   Staff-facing / shared
  admin/                      Fleet-manager (Admin role) features
    dashboard.js, driver.js, issue.js, mileageLog.js, report.js, reservation.js, vehicle.js
  it/                         IT Admin features
    activity.js, apiStatus.js, user.js
jobs/                        Background schedulers, started once from app.js
  reminderScheduler.js        Upcoming-booking reminder emails
  mileageLogScheduler.js      Monthly mileage log emailed to Transportation
middleware/                   Express middleware
  auth.js                     Login/role guards, "view as" role computation
  validate.js                 Generic Joi-validate-body middleware factory
  keycafeWebhookAuth.js        HTTP Basic auth check for the KeyCafe webhook
models/                       Mongoose schemas, one file per collection
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
    mileageLogNotifications.js    Monthly mileage log email
  mileageLog.js                Builds "vehicle X's log for month Y" (shared by the page + job)
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
areas) runs, using `models/` to talk to MongoDB and `services/` for KeyCafe/email → a template
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
