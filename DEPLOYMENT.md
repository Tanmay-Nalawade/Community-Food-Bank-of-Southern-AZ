# Deploying the Motor Pool app

This app is a Node.js 22 web app backed by **Microsoft SQL Server**. It ships as a Docker image
(see `Dockerfile`), or runs directly with Node.js. The database starts empty — the app creates and
updates its own tables (migrations) on start.

## Requirements

- **SQL Server 2016 or newer** (developed and tested on SQL Server 2022), with **SQL Server
  authentication** (mixed mode) and **TCP/IP** enabled.
- **Docker** with the compose plugin, *or* **Node.js 22** + npm.
- **HTTPS in front of the app.** In production the login cookie is only sent over HTTPS; over plain
  HTTP nobody can log in. Put the app behind your reverse proxy / load balancer (IIS with URL
  Rewrite + ARR, nginx, etc.), terminate TLS there, and forward to the app's port (8080 by default)
  with the `X-Forwarded-Proto: https` header set. The app trusts one proxy hop.
- **Arizona time.** Booking times are entered as local times and KeyCafe access windows are built
  from them, so the app must run in Arizona time: the Docker image sets `TZ=America/Phoenix`; when
  running Node directly, set `TZ=America/Phoenix` or run it on a server set to *US Mountain Standard
  Time* (Arizona, no daylight saving).
- **Outgoing email (SMTP)** for account verification, password resets and notifications. Without
  it, emails are only written to the app's log.
- **KeyCafe** API credentials, and a public HTTPS URL KeyCafe can reach for its webhook.

## 1. Prepare the database (DBA)

Create an empty database and a SQL login for the app that owns it — the app creates and changes its
own tables, so it needs `db_owner` on **this database only**. For example
(`docker/mssql-init.sql` is the same script the local Docker setup uses):

```sql
CREATE DATABASE cfb_motor_pool;
GO
CREATE LOGIN cfb_app WITH PASSWORD = '<strong password>', DEFAULT_DATABASE = cfb_motor_pool;
GO
USE cfb_motor_pool;
CREATE USER cfb_app FOR LOGIN cfb_app;
ALTER ROLE db_owner ADD MEMBER cfb_app;
GO
```

Keep the server's default case-insensitive collation (e.g. `SQL_Latin1_General_CP1_CI_AS`) —
searches and email-address matching rely on it.

## 2. Configure

```
cp .env.example .env
```

Fill in `.env` (the comments in it explain each value). At minimum:

| Setting | Value |
|---|---|
| `DB_HOST`, `DB_PORT` (or `DB_INSTANCE`) | the SQL Server's address — port 1433 by default, or a named instance such as `SQLEXPRESS` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | the database and login from step 1. Avoid `'`, `$` and `#` in the password |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | `true` / `false` for a server with a trusted TLS certificate; set `DB_TRUST_SERVER_CERTIFICATE=true` if it uses a self-signed one |
| `SESSION_SECRET` | a long random string, e.g. `openssl rand -hex 32` — the app refuses to start in production without it |
| `APP_BASE_URL` | the public HTTPS address, no trailing slash — used for links in emails |
| `TZ` / `KEYCAFE_TIMEZONE` | `America/Phoenix` |
| `SMTP_*` | your mail server |
| `KEYCAFE_EMAIL`, `KEYCAFE_TOKEN`, `KEYCAFE_AUTH_TYPE` | from the KeyCafe account |
| `KEYCAFE_WEBHOOK_USERNAME`, `KEYCAFE_WEBHOOK_PASSWORD` | any credentials you choose (see step 5) |

Leave `COMPOSE_FILE` unset — it's only for local development. `DB_SA_PASSWORD` is only for the
bundled SQL Server container (below) and isn't needed when using your own server.

## 3. Start

**Docker, using your SQL Server:** set `DOCKER_DB_HOST` / `DOCKER_DB_PORT` in `.env` to the SQL
Server as seen from inside the container, then start only the app:

```
docker compose up -d --build --no-deps app
```

**Docker, with a bundled SQL Server container** (no existing server; e.g. a test environment): set
`DB_SA_PASSWORD` in `.env`, then `docker compose up -d --build`. It starts SQL Server 2022
(Developer edition by default — set `MSSQL_PID` to the edition you're licensed for), creates the
database and login from `.env`, then starts the app.

On every start the app container applies any pending database migrations, then starts the app on
port 8080 (`PORT` in `.env` changes it). Check it with `docker compose logs app` — it should end
with `Serving on port 8080`.

**Without Docker** (e.g. on Windows Server behind IIS):

```
npm ci --omit=dev
npm run db:migrate
```

then run `node app.js` with `NODE_ENV=production` and `TZ=America/Phoenix` set, under a process
manager / Windows service so it restarts automatically. Run `npm run db:migrate` again after every
update — the app refuses to start while a migration is pending.

## 4. Create the first IT Admin

1. Open the site and **Sign Up** with an `@communityfoodbank.org` email address.
2. Click the link in the verification email. (No SMTP yet? It's printed in the app's log.)
3. Make that account an IT Admin from the server:
   ```
   docker compose exec app npm run promote-user -- you@communityfoodbank.org "IT Admin"
   ```
   (without Docker: `npm run promote-user -- you@communityfoodbank.org "IT Admin"`)
4. From then on, the IT Admin manages everyone else's role (Staff / Admin / IT Admin) in the app
   under **Users**, and sets who receives notification emails under **Notifications**.

**Never run `npm run seed` on the server** — it empties every table and creates demo accounts with
the password `password123`. It's for local development only.

## 5. Connect KeyCafe

With the KeyCafe settings in `.env` and the app reachable over HTTPS:

```
docker compose exec app npm run register-webhook -- https://<your-domain>/webhooks/keycafe
```

That registers the app's webhook address with KeyCafe using the webhook username and password
from `.env`, so key pick-ups and returns update bookings automatically. **API Status** in the IT
Admin menu can then test the connection.

## Updating to a new version

```
git pull
docker compose up -d --build --no-deps app
```

Database changes ship as migrations and are applied automatically when the container starts.

## Backups

Everything the app stores is in its SQL Server database (accounts, vehicles, bookings, logs,
settings, login sessions); nothing is written to disk inside the container. Back it up with your
usual SQL Server backups (e.g. a scheduled `BACKUP DATABASE cfb_motor_pool`).
