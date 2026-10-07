# Deploying the Motor Pool app

This app is a Node.js 22 web app backed by MySQL. It ships as a Docker image (see `Dockerfile`);
`docker-compose.yml` runs it together with its own MySQL container, or alone against an existing
MySQL server. The database starts empty — the app creates its own tables.

## Requirements

- **Docker** with the compose plugin (or Node.js 22 + npm, if you'd rather not use Docker).
- **MySQL 8.0.16 or newer** (developed and tested on 8.4) — either the bundled container or your
  own server. The schema uses CHECK constraints and generated columns.
- **HTTPS in front of the app.** In production the login cookie is only sent over HTTPS; over plain
  HTTP nobody can log in. Put the app behind your reverse proxy / load balancer (IIS, nginx, etc.),
  terminate TLS there, and forward to the app's port (8080 by default) with the
  `X-Forwarded-Proto: https` header set. The app trusts one proxy hop.
- **Outgoing email (SMTP)** for account verification, password resets and notifications. Without
  it, emails are only written to the app's log.
- **KeyCafe** API credentials, and a public HTTPS URL KeyCafe can reach for its webhook.

## 1. Configure

```
cp .env.example .env
```

Fill in `.env` (the comments in it explain each value). At minimum:

| Setting | Value |
|---|---|
| `SESSION_SECRET` | a long random string, e.g. `openssl rand -hex 32` — the app refuses to start in production without it |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | the database and account the app should use |
| `DB_ROOT_PASSWORD` | only for the bundled MySQL container (sets its root password) |
| `APP_BASE_URL` | the public HTTPS address, no trailing slash — used for links in emails |
| `TZ` / `KEYCAFE_TIMEZONE` | `America/Phoenix` (booking times and KeyCafe access windows use this) |
| `SMTP_*` | your mail server |
| `KEYCAFE_EMAIL`, `KEYCAFE_TOKEN`, `KEYCAFE_AUTH_TYPE` | from the KeyCafe account |
| `KEYCAFE_WEBHOOK_USERNAME`, `KEYCAFE_WEBHOOK_PASSWORD` | any credentials you choose (see step 4) |

Leave `COMPOSE_FILE` unset — it's only for local development.

## 2. Start

**With the bundled MySQL container:**

```
docker compose up -d --build
```

**With your own MySQL server:** create the database and an account with full rights on it, set
`DOCKER_DB_HOST` / `DOCKER_DB_PORT` in `.env` to that server, then start only the app:

```
docker compose up -d --build --no-deps app
```

On every start the container applies any pending database migrations, then starts the app on port
8080 (`PORT` in `.env` changes it). Check it with `docker compose logs app` — it should end with
`Serving on port 8080`.

**Without Docker:** `npm ci --omit=dev`, `npm run db:migrate`, then `NODE_ENV=production TZ=America/Phoenix node app.js`
(run it under your process manager / service). Set `DB_HOST` / `DB_PORT` to the MySQL server.

## 3. Create the first IT Admin

1. Open the site and **Sign Up** with an `@communityfoodbank.org` email address.
2. Click the link in the verification email. (No SMTP yet? It's printed in `docker compose logs app`.)
3. Make that account an IT Admin from the server:
   ```
   docker compose exec app npm run promote-user -- you@communityfoodbank.org "IT Admin"
   ```
4. From then on, the IT Admin manages everyone else's role (Staff / Admin / IT Admin) in the app
   under **Users**, and sets who receives notification emails under **Notifications**.

**Never run `npm run seed` on the server** — it empties every table and creates demo accounts with
the password `password123`. It's for local development only.

## 4. Connect KeyCafe

With the KeyCafe settings in `.env` and the app reachable at `APP_BASE_URL` over HTTPS:

```
docker compose exec app npm run register-webhook -- https://<your-domain>/webhooks/keycafe
```

That registers the app's webhook address with KeyCafe using the webhook username and password
from `.env`, so key pick-ups and returns update bookings automatically. **API Status** in
the IT Admin menu can then test the connection.

## Updating to a new version

```
git pull
docker compose up -d --build
```

Database changes ship as migrations and are applied automatically when the container starts. The
app refuses to start if a migration is pending (for example when running without Docker and
`npm run db:migrate` was skipped).

## Backups

Everything the app stores is in its MySQL database (accounts, vehicles, bookings, logs, settings);
nothing is written to disk inside the container. Back up the database with your usual MySQL tooling,
e.g. `mysqldump --single-transaction cfb_motor_pool`.
