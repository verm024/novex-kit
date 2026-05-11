# First-Time Setup Guide

This guide is for the **very first time** you clone and run this project. Follow each step in order — do not skip.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 24 or higher** — check with `node -v`
- **npm 11 or higher** — check with `npm -v`
- **Git** — check with `git --version`

If you do not have Node.js, install it from https://nodejs.org (use LTS or Latest — must be 24+).

---

## Step 1 — Install all dependencies

From the **root** of the project:

```bash
npm i
```

This installs dependencies for every workspace (backend, frontends, shared libs) in one command.

---

## Step 2 — Set up Git hooks

```bash
# Windows (PowerShell)
git config core.hooksPath .githooks
```

This enables pre-commit and pre-push checks so bad commits are caught early.

---

## Step 3 — Check and create your env files

**Read [env-guide.md](env-guide.md) fully before this step.**

There are env files you must create or fill before the app will run.

### 3a. Backend env file (`apps/sample-api/.env`)

Check if it exists:

```powershell
Test-Path apps/sample-api/.env
```

If it returns `False`, create it by copying the template:

```powershell
Copy-Item apps/sample-api/.env.local apps/sample-api/.env
```

Then open `apps/sample-api/.env` and fill in the values. See [env-guide.md](env-guide.md) for what each variable means and which ones to ask your manager for.

### 3b. Backend config file (`apps/sample-api/.env.json`)

This file **already exists** in the repo. You do not need to create it.

Open it and find any values marked with `<REDACTED>` or `<contents of ...>`. These are the secrets you need to ask your manager for. See [env-guide.md](env-guide.md) for the full list.

### 3c. Vue frontend env files

Both frontend env files already exist:

- `apps/sample-vue-full/.env.development` — already in repo
- `apps/sample-vue-minimal/.env.development` — already in repo

Check that `VITE_API_URL` points to your local backend (`http://127.0.0.1:3000`). See [env-guide.md](env-guide.md) for details.

---

## Step 4 — Set up the local database

The project uses a file-based local database (PGlite). You need to create it once.

```bash
cd scripts/dbdeploy

# Run all migrations
npx knex --knexfile db-sample/knexfile.js migrate:latest

# Seed initial data
npx knex --knexfile db-sample/knexfile.js seed:run
```

You only need to do this once. The database file will be created at `scripts/dbdeploy/db-sample/dev.db`.

---

## Step 5 — Run the database server

The local database needs to be served as a Postgres-compatible server so the backend can connect to it. Open a terminal and keep it running:

```bash
cd scripts/dbdeploy
npm run serve
```

Leave this terminal open. Do not close it while working.

---

## Step 6 — Run the backend API

Open a new terminal:

```bash
cd apps/sample-api
npm run start
```

Wait until you see a log line like:

```
Env=development, Port=3000, https=false
```

Verify it is working by visiting: http://127.0.0.1:3000/api/sample-api/healthcheck

---

## Step 7 — Run the frontend(s)

### Full Vue (port 8080) — includes auth, routing, UI framework

Open a new terminal:

```bash
cd apps/sample-vue-full
npm run dev
```

Visit: http://127.0.0.1:8080

### Minimal Vue (port 8081) — simple, no auth

Open a new terminal:

```bash
cd apps/sample-vue-minimal
npm run dev
```

Visit: http://127.0.0.1:8081

**Login credentials for the full Vue app:**
- Username: `test`
- Password: `test`
- OTP (if prompted): `111111`

---

## Step 8 — (Optional) Run the MCP server

Only needed if you are working with AI tool integration.

```bash
cd apps/sample-mcp
npm run start
```

---

## What You Should Have Running

| Terminal | What is running | Port |
|---|---|---|
| Terminal 1 | DB server (`scripts/dbdeploy`) | local file |
| Terminal 2 | Backend API (`apps/sample-api`) | 3000 |
| Terminal 3 | Vue full (optional) | 8080 |
| Terminal 4 | Vue minimal (optional) | 8081 |

---

## Troubleshooting First-Time Setup

**`npm i` fails with peer dependency errors**
Make sure you are on Node.js 24+ and npm 11+.

**Backend crashes immediately on start**
Most likely a missing or incorrect `DATABASE_URL` in `apps/sample-api/.env`. Confirm the DB server is running first.

**Frontend shows API errors**
Confirm `VITE_API_URL=http://127.0.0.1:3000` in your Vue `.env.development` file and that the backend is actually running on port 3000.

**Port already in use**
Change `API_PORT` in `apps/sample-api/.env` to another port (e.g. `3001`) and update `VITE_API_URL` and `CORS_OPTIONS.origin` in the corresponding files.
