# Re-Run Guide (Day-to-Day)

This guide is for every time after the first-time setup. You already have everything installed and configured — you just need to start the right services.

---

## Things You Do NOT Need to Do Again

- `npm i` — already installed (only redo if `package.json` changed after a `git pull`)
- Database migration/seed — already done
- Create `.env` files — already done
- Build shared packages — already built (only redo if `common/` changed after a `git pull`)

---

## Starting the App

Open **3 separate terminals** and run each command in its own terminal.

### Terminal 1 — Start the database server

```bash
cd scripts/dbdeploy
npm run serve
```

Wait until it says it is ready before starting the backend. Keep this terminal open.

### Terminal 2 — Start the backend API

```bash
cd apps/sample-api
npm run start
```

Wait until you see:

```
Env=development, Port=3000, https=false
```

Verify: http://127.0.0.1:3000/api/healthcheck

### Terminal 3 — Start the Vue frontend

Choose the one you need:

```bash
# Full Vue app (port 8081) — has auth, routing, full UI
cd apps/sample-vue-full
npm run dev

# OR minimal Vue app (port 8080) — bare bones
cd apps/sample-vue-minimal
npm run dev
```

### Terminal 4 — (Optional) MCP server

Only if you are working on AI tool integration:

```bash
cd apps/sample-mcp
npm run start
```

---

## After a `git pull`

If you pulled new changes from the repo, check the following before starting:

### Check if dependencies changed

```powershell
# If package.json changed in any workspace, reinstall:
npm i
```

### Check if common packages changed

```powershell
# If anything in common/compiled/ changed, rebuild:
cd common/compiled/node ; npm run build ; cd ../vue ; npm run build ; cd ../../..
```

### Check if there are new database migrations

```bash
cd scripts/dbdeploy
npx knex --knexfile db-sample/knexfile.js migrate:list
```

If it shows pending migrations, run:

```bash
npx knex --knexfile db-sample/knexfile.js migrate:up
# repeat if more than one pending
```

---

## Quick Reference — Start Order

```
1. DB server     →  cd scripts/dbdeploy && npm run serve
2. Backend API   →  cd apps/sample-api && npm run start
3. Frontend      →  cd apps/sample-vue-full && npm run dev
```

Always start in this order. The backend needs the DB, and the frontend needs the backend.

---

## Stopping Everything

Press `Ctrl + C` in each terminal to stop the process. No special cleanup needed for local development.

---

## Build for Production

This is only needed when deploying — not for local development.

```bash
# Frontend build
cd apps/sample-vue-full
npm run build
# output is in apps/sample-vue-full/dist/

# Backend — no build step needed, Node 24 runs TypeScript natively
```
