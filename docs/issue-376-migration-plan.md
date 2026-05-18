# Issue #376 — Sample DB Migration: Drizzle Replace Knex

## Task Summary (From Manager)

**Issue:** [#376 Sample DB Migration](https://github.com/ais-one/novex-kit/issues/376)  
**Assigned to:** Muhammad Rifa (primary), Muhammad Naufal (support)  
**Label:** bug  
**Affected Areas:** `scripts/`, `docs/`

### What the Manager Wants

> Please fix the migration in `scripts/db-deploy` for both `db-iam` and `db-sample`
> Get the migration and seeding to work
> Use drizzle-orm instead of knex, remove knex package

**Clarification on "remove knex":** Knex is intentionally kept in the project for the `t4t` (table-to-table) runtime feature, which lives in `common/compiled/node/services/db/knex.ts` and is used by the application at runtime. The goal is NOT to remove the `knex` package from the entire monorepo. The goal is to remove knex from the **migration and seeding scripts only** — delete knex-based migration files, delete the old `knexfile.ts`, and convert seed files to use drizzle instead.

**In plain terms:**
1. Both `db-iam` and `db-sample` under `scripts/dbdeploy/` must use **drizzle-orm** for migrations and seeding.
2. The knex-based migration files and `knexfile.ts` in `scripts/dbdeploy/` must be removed.
3. Seed files must be converted from knex API to drizzle API.
4. Migrations and seeding must be runnable and functional end-to-end using drizzle only.
5. Documentation must reflect the new drizzle-based commands.

---

## What Went Wrong: The Commit `b4215eb` Seed Revert

### What Happened

**Before this commit**, the seed files (`initial_users.ts`, `initial_testdata.ts`, `initial_rbac.ts`) were **already written with the drizzle API** — `NodePgDatabase`, `db.insert()`, `db.delete()`. This was correct.

**During first-time local setup**, the old documentation said to run:
```
npx knex --knexfile db-sample/knexfile.js migrate:latest
```

This ran the old Knex migration files from `db-sample/migrations/`. When it hit `20260415120000_audit_log.ts`, it executed:
```sql
REVOKE UPDATE, DELETE ON audit_log FROM api_role;
```

This failed with an error because `api_role` does not exist in the dev database. Copilot then:
1. **Correctly** fixed the migration file by wrapping the REVOKE in a `DO $$ IF EXISTS` block
2. **Incorrectly** also suggested reverting the seed files from drizzle back to Knex

**The revert to Knex in the seed files was a mistake.** The migration error had nothing to do with the seed files. The two issues are completely unrelated.

The result is the current broken state: the seed runner (`seed.ts`) passes a drizzle instance to seed functions that now expect Knex — which will fail at runtime.

### Why Copilot Got It Wrong

The migration was being run with the **wrong tool** — `npx knex migrate:latest` — against old Knex migration files that are now dead code. The correct migration tool is `npm run db:migrate` (drizzle-kit), which reads from `drizzle/0000_left_ben_grimm.sql` and never touches the `migrations/` folder at all.

If drizzle-kit had been used, the `api_role` error would never have occurred, and the seeds would not have been touched.

### Does This Commit Need to Be Removed?

**No — do not touch it.** This commit is a local "tidy up" commit tagged `(dont pick)` and will **not be cherry-picked** into the pull request. That means the seed revert it contains will never land in the actual PR branch. The PR will be built from commits that come before or after this one, so the Knex seeds in the current working tree are not a concern for the PR itself.

The commit also contains other legitimate local-setup changes that are useful to keep:
- `docs/env-guide.md`, `docs/setup-first-time.md`, `docs/setup-rerun.md` — new setup docs
- `.env.local`, `.env.json`, `vite.config.js`, `serve-db.ts` local config

The actual implementation work for the issue will go in **new commits** on this branch (which will be cherry-picked). Those new commits will re-introduce the drizzle seeds, add the missing SQL, and build db-iam. The tidy-up commit stays as a local reference.

---

## Current State Analysis

### What Rifa Has Done (Commit: `a080cb3`)

| Item | Status | Notes |
|---|---|---|
| `db-sample/drizzle.config.ts` | Done | Points schema to `common/compiled/node/services/db/schema.ts` |
| `db-sample/drizzle/0000_left_ben_grimm.sql` | Done | SQL migration generated from drizzle schema; covers all app tables |
| `db-sample/drizzle/meta/` | Done | Drizzle journal and snapshot metadata |
| `db-sample/seed.ts` runner | Done | New seed runner created using drizzle + pg Pool |
| `db-sample/seeds/initial_openfga.ts` | Done | Fully converted to drizzle API |
| `package.json` `db:generate` and `db:migrate` scripts | Done | Added, use drizzle-kit |

### What Is NOT Done (Broken or Missing)

#### 1. Seed files still use Knex API — BROKEN (critical)

The seed runner (`seed.ts`) creates a drizzle `NodePgDatabase` instance and passes it to each seed function. However, **three of the four seed files still expect a `Knex` instance** and use the Knex query builder API. This is a type and API mismatch — it will fail at runtime.

| File | State | Problem |
|---|---|---|
| `seeds/initial_users.ts` | Broken | `import type { Knex }`, uses `knex('users').del()`, `knex('users').insert()` |
| `seeds/initial_testdata.ts` | Broken | `import type { Knex }`, uses `knex('student').del()`, etc. |
| `seeds/initial_rbac.ts` | Broken | `import type { Knex }`, uses `knex('tenants').del()`, etc. |
| `seeds/initial_openfga.ts` | Done | Already uses drizzle `NodePgDatabase` correctly |

#### 2. The drizzle SQL file is missing raw SQL operations

`0000_left_ben_grimm.sql` was auto-generated from `schema.ts` and covers all table definitions (CREATE TABLE, constraints, FK, indexes). However, the old `migrations/` files also contained raw SQL operations that drizzle-kit does NOT generate automatically, because they are not expressible in the schema:

| Raw SQL operation | Old migration file | In drizzle SQL? |
|---|---|---|
| `audit_trigger_func()` PL/pgSQL function | `20260415120002_audit_trigger_func.ts` | No |
| `enforce_append_only()` PL/pgSQL function | `20260415120003_enforce_append_only_func.ts` | No |
| `CREATE TRIGGER audit_users` on users table | `20260415120004_audit_triggers.ts` | No |
| `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC` | `20260415120000_audit_log.ts` | No |
| `CREATE ROLE audit_reader`, `GRANT SELECT ON audit_log` | `20260415120000_audit_log.ts` | No |
| `REVOKE ALL ON hard_delete_log FROM PUBLIC` | `20260415120001_hard_delete_log.ts` | No |
| `CREATE ROLE admin_role`, `GRANT INSERT ON hard_delete_log` | `20260415120001_hard_delete_log.ts` | No |

These operations need to be added as a separate handwritten SQL file (e.g. `drizzle/0001_functions_and_triggers.sql`) so drizzle-kit will apply them in order.

#### 3. Migration files in `migrations/` are Knex-based and dead code

All 9 files in `db-sample/migrations/` use `import type { Knex } from 'knex'`. The drizzle workflow does NOT use this folder — it generates SQL into `drizzle/`. These files are dead code and should be removed along with `knexfile.ts`.

Files to delete:
- `migrations/20230827094947_audit_logs.ts`
- `migrations/20230827094948_initial.ts`
- `migrations/20260415120000_audit_log.ts`
- `migrations/20260415120001_hard_delete_log.ts`
- `migrations/20260415120002_audit_trigger_func.ts`
- `migrations/20260415120003_enforce_append_only_func.ts`
- `migrations/20260415120004_audit_triggers.ts`
- `migrations/20260416000000_fga_config.ts`
- `migrations/20260416000001_rbac_tables.ts`
- `knexfile.ts`

#### 4. `db-iam` has NO drizzle setup at all

The `db-iam/` folder only has a Knex migration file and two raw SQL reference files. Nothing has been converted to drizzle.

| Item | State |
|---|---|
| `db-iam/20260101000000_identity.ts` | Still Knex-based (needs to be deleted after conversion) |
| `db-iam/drizzle.config.ts` | Missing |
| `db-iam/schema.ts` | Missing |
| `db-iam/drizzle/` (generated SQL) | Missing |
| `db-iam/seed.ts` | Missing |
| `db-iam/seeds/` | Missing entirely |
| `package.json` `db:iam:migrate` scripts | Missing |

#### 5. Port inconsistencies across files

See the dedicated **Port Reference** section below for the full breakdown. Short version: `db-sample/.env` has the wrong port for local PGlite, and `docs/env-guide.md` also documents the wrong local port.

#### 6 (was 5). `db-sample/.env` has wrong port for local PGlite

`db-sample/.env` has `DATABASE_URL=postgresql://postgres:@127.0.0.1:5432/postgres` (port 5432), but `serve-db.ts` runs PGlite on port **55432**. The seed command loads this `.env` file, so if running against local PGlite it will fail to connect. The `.env` needs to be updated to port 55432 and match the app's connection string.

For reference, `apps/sample-api/.env.local` correctly uses port 55432:
```
DRIZZLE_PG=postgresql://postgres:postgres@127.0.0.1:55432/db_express?sslmode=disable
```

#### 6 (was 6). Documentation still references Knex commands

| File | Problem |
|---|---|
| `scripts/dbdeploy/READMD.md` | Entire file references knex CLI commands |
| `docs/setup-first-time.md` Step 4 | Uses `npx knex --knexfile db-sample/knexfile.js migrate:latest` and `seed:run` |

---

## Are the Current and Expected Flows the Same?

**No — they are not the same.** The expected flow (fully drizzle, end-to-end working) is close but not there yet. Here is exactly where they diverge:

| Area | Current State | Expected State | Gap |
|---|---|---|---|
| db-sample migration | `drizzle-kit migrate` applies `0000_left_ben_grimm.sql` (all tables) | Same, PLUS `0001_functions_and_triggers.sql` | Missing: triggers, PL/pgSQL functions, REVOKE/GRANT |
| db-sample seed runner (`seed.ts`) | Uses drizzle — correct | Uses drizzle — same | No gap here |
| `initial_users.ts` | **Knex** (reverted in `b4215eb`) | Drizzle | Needs re-conversion |
| `initial_testdata.ts` | **Knex** (reverted in `b4215eb`) | Drizzle | Needs re-conversion |
| `initial_rbac.ts` | **Knex** (reverted in `b4215eb`) | Drizzle | Needs re-conversion |
| `initial_openfga.ts` | Drizzle — correct | Drizzle — same | No gap |
| `db-sample/.env` port | 5432 (wrong for local PGlite) | 55432 | One-line fix |
| db-iam migration | Does not exist | Drizzle-kit migrate with IAM SQL | Needs to be built |
| db-iam seeding | Does not exist | Drizzle-based seed runner | Needs to be built |
| Old `migrations/` folder | Still exists (9 Knex files, dead code) | Deleted | Cleanup |
| `knexfile.ts` | Still exists (dead code) | Deleted | Cleanup |
| Documentation | Still references knex CLI commands | References drizzle-kit commands | Update |

**In short:** For db-sample, the migration infrastructure is mostly ready. The seeds are the main blocker — they were reverted from drizzle back to Knex in `b4215eb` and just need to be re-converted. For db-iam, everything needs to be built from scratch.

---

## Migration and Seed Flow

### Current State Flow

#### db-sample — Migration

```
Developer runs:
  npm run db:migrate     (from scripts/dbdeploy/)

→ Command executes:
  cd db-sample && drizzle-kit migrate

→ drizzle-kit reads:
  db-sample/drizzle.config.ts
    dialect: postgresql
    schema:  ../../../common/compiled/node/services/db/schema.ts
    out:     ./drizzle  (where SQL migration files live)
    url:     process.env.DATABASE_URL (from shell env, NOT from .env file)
             default fallback: postgresql://localhost:5432/dev

→ drizzle-kit applies (in order):
  db-sample/drizzle/0000_left_ben_grimm.sql
    Creates: all tables (users, country, state, student, audit_log, etc.)
    Stack:   drizzle-kit CLI → pg (postgres driver) → PostgreSQL / PGlite socket

→ Records completion in:
  drizzle_migrations table (created automatically)

⚠️ GAPS: triggers, PL/pgSQL functions, REVOKE/GRANT from old migrations/ are NOT applied
```

#### db-sample — Seeding

```
Developer runs:
  npm run seed     (from scripts/dbdeploy/)

→ Command executes:
  node --env-file=db-sample/.env db-sample/seed.ts

→ Loads env from:
  db-sample/.env  →  DATABASE_URL=postgresql://postgres:@127.0.0.1:5432/postgres
  ⚠️ PORT MISMATCH: PGlite serves on 55432, not 5432

→ seed.ts creates:
  drizzle(new Pool({ connectionString: DATABASE_URL }))
  Stack: drizzle-orm + pg (node-postgres)

→ seed.ts calls in order:
  1. initial_users(db)    → ❌ expects Knex instance, receives drizzle NodePgDatabase → FAILS
  2. initial_testdata(db) → ❌ expects Knex instance, receives drizzle NodePgDatabase → FAILS
  3. initial_rbac(db)     → ❌ expects Knex instance, receives drizzle NodePgDatabase → FAILS
  4. initial_openfga(db)  → ✓ expects NodePgDatabase, works correctly
```

#### db-iam — Migration and Seeding

```
NOT IMPLEMENTED — no drizzle setup exists.
(A Knex migration file exists but there is no command to run it)
```

---

### Expected Flow After Full Drizzle Migration

#### db-sample — Migration

```
Developer runs:
  npm run db:migrate     (from scripts/dbdeploy/)

→ drizzle-kit migrate reads db-sample/drizzle.config.ts
→ Applies in order:
  1. db-sample/drizzle/0000_left_ben_grimm.sql   → creates all tables
  2. db-sample/drizzle/0001_functions_and_triggers.sql  → creates PL/pgSQL functions, triggers, grants

→ Stack: drizzle-kit → pg → PostgreSQL / PGlite socket (55432 local)
→ Records in drizzle_migrations table
```

#### db-sample — Seeding

```
Developer runs:
  npm run seed     (from scripts/dbdeploy/)

→ node --env-file=db-sample/.env db-sample/seed.ts
→ db-sample/.env: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/db_express

→ seed.ts creates drizzle(pool)
→ Calls in order (all using drizzle API):
  1. initial_users(db)    → ✓ drizzle insert/delete
  2. initial_testdata(db) → ✓ drizzle insert/delete
  3. initial_rbac(db)     → ✓ drizzle insert/delete
  4. initial_openfga(db)  → ✓ already works (no change needed)
```

#### db-iam — Migration

```
Developer runs:
  npm run db:iam:migrate     (from scripts/dbdeploy/)

→ drizzle-kit reads db-iam/drizzle.config.ts
→ Applies db-iam/drizzle/0000_identity.sql  (generated from db-iam/schema.ts)
→ Stack: drizzle-kit → pg → separate PostgreSQL instance / separate PGlite port
```

#### db-iam — Seeding

```
Developer runs:
  npm run db:iam:seed     (from scripts/dbdeploy/)

→ node --env-file=db-iam/.env db-iam/seed.ts
→ Runs seed files for identity data (admin user, roles, etc.)
```

---

## Can the `migrations/` Files Be Converted to Drizzle?

**The table-creating migrations are already superseded — no conversion needed.**

Drizzle works differently from Knex. Instead of writing migration files by hand, you define your tables in a TypeScript schema file (`schema.ts`), and drizzle-kit generates the SQL for you. The `0000_left_ben_grimm.sql` was already generated this way and covers all the same tables that the old `migrations/` files created.

**For the raw SQL operations (triggers, functions, permissions):**

These CANNOT be auto-generated by drizzle-kit because they are not expressible in `schema.ts` (PL/pgSQL functions, triggers, REVOKE/GRANT, role creation). However, they CAN be moved into manually written SQL files inside the `drizzle/` folder:

- Create `db-sample/drizzle/0001_functions_and_triggers.sql` by hand
- Write plain SQL inside it (copy from the `.raw(...)` calls in the old migration files)
- Update `db-sample/drizzle/meta/_journal.json` to register the new file
- `drizzle-kit migrate` will then apply it in order after `0000_...sql`

This is the correct approach. The old Knex migration files can then be deleted.

---

## db-iam: What It Is, How It Differs, and What Is Needed

### What is db-iam?

`db-iam` is a **separate database** for a full Identity and Access Management service. It is designed as a proper IAM microservice with:

- UUID-based user identities (unlike db-sample which uses integer IDs)
- Password credential storage
- TOTP MFA (Google Authenticator / Authy)
- MFA recovery codes
- SMS/email OTP challenges
- OAuth2/OIDC/SAML federated identities
- RSA key pairs for JWT signing and rotation
- JWT session tracking (JTI-based revocation)
- Auth audit log

This is a **different and more complete IAM schema** than the simplified `users` table in `db-sample`, which is just for sample/demo purposes.

### Is db-iam connected to sample-api?

**No.** Looking at `apps/sample-api/.env.json`, the `SERVICES_CONFIG` only connects to one drizzle instance (`drizzle1` using `DRIZZLE_PG`), which points to the db-sample database. The sample-api does not use the db-iam database.

`db-iam` appears to be planned for a future separate IAM service (not yet implemented in the codebase).

### Does the seed or migrate command cover both?

**No.** They are completely separate. You must run commands for each one individually.

### Is the process the same as db-sample?

Yes, the drizzle migration process is the same:
1. Write a drizzle schema file (`db-iam/schema.ts`)
2. Create `db-iam/drizzle.config.ts`
3. Run `drizzle-kit generate` to produce SQL
4. Run `drizzle-kit migrate` to apply it

The difference is that db-iam has its own schema file, its own drizzle config, its own `.env` with its own `DATABASE_URL`, and its own serve command.

### How hard is it to convert db-iam to drizzle?

**Medium difficulty.** The schema is complex (11 tables with UUIDs, FK constraints, triggers), but the process is straightforward:

1. Write `db-iam/schema.ts` with drizzle table definitions that match the tables in `20260101000000_identity.ts`
2. Create `db-iam/drizzle.config.ts`
3. Run `drizzle-kit generate` — drizzle writes the SQL
4. Write raw SQL file for the trigger functions (`set_updated_at`) and `updated_at` triggers
5. Create `db-iam/seed.ts` runner and any seed files needed

The main effort is writing `schema.ts` from scratch (the Knex migration file is a reference, not a reusable source). This is roughly the same effort as db-sample — just more tables.

---

## Local vs Instance-Based Postgres

Both databases (db-sample and db-iam) support two modes:

### Local mode (PGlite)

- **What it is:** An in-process PostgreSQL-compatible engine backed by a local folder (`dev.db/`). No separate postgres installation needed.
- **How it's served:** `serve-db.ts` starts a socket server that makes PGlite look like a real PostgreSQL server on a local port.
- **db-sample:** Served on `127.0.0.1:55432` — the `npm run serve` command.
- **db-iam (planned):** Would need its own serve command on a different port (e.g. `55433`). There is currently NO serve command for db-iam.
- **Running migration locally:** Start `npm run serve` first, then run `npm run db:migrate`. The migration connects to `127.0.0.1:55432`.
- **Limitation:** PGlite does not support all PostgreSQL features (e.g. some roles/grants may behave differently).

### Instance-based (real PostgreSQL)

- **What it is:** A real PostgreSQL server — local docker, Neon, Supabase, Railway, etc.
- **How to use:** Set `DATABASE_URL` in your shell environment (or in `.env`) to the real postgres connection string before running drizzle-kit commands.
- **No serve step needed** — drizzle-kit connects directly to the server.

### Migration commands work the same for both

```powershell
# Local PGlite — start serve first, then:
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/db_express"
npm run db:migrate

# Instance-based:
$env:DATABASE_URL = "postgresql://user:pass@your-host:5432/yourdb"
npm run db:migrate
```

The only difference is the `DATABASE_URL`. The same SQL files are applied either way.

### How to test migration on a real postgres instance

1. Start a local postgres container:
   ```powershell
   docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
   ```
2. Set DATABASE_URL:
   ```powershell
   $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
   ```
3. Run migration:
   ```powershell
   cd scripts/dbdeploy
   npm run db:migrate
   ```
4. Connect with psql or DBeaver to verify tables:
   ```
   psql postgresql://postgres:postgres@127.0.0.1:5432/postgres
   \dt
   SELECT * FROM drizzle_migrations;
   ```

---

## How to Revert the Migration and Retest

### Local (PGlite) — db-sample

Since PGlite is file-based, resetting is just deleting the database folder:

```powershell
# 1. Stop the database server first (Ctrl+C in the serve terminal)

# 2. Delete the database
Remove-Item -Recurse -Force scripts/dbdeploy/db-sample/dev.db

# 3. Run migration again
cd scripts/dbdeploy
npm run db:migrate

# 4. Run seed again
npm run seed
```

### Instance-based (real Postgres)

Drizzle-kit does not have a built-in "rollback" for `migrate`. Your options are:

- **Drop and recreate the database** (cleanest for dev):
  ```sql
  DROP DATABASE mydb;
  CREATE DATABASE mydb;
  ```
  Then re-run `npm run db:migrate`.

- **Manually undo** by running the `down()` logic from the old Knex migration files as raw SQL, or by writing a custom cleanup script. This is more surgical but more error-prone.

- **Use drizzle-kit's `drop` command** (if applicable for your drizzle-kit version) to drop all tables in order.

### Note on re-running migration when already applied

If you run `npm run db:migrate` and the migration was already applied, drizzle-kit will check the `drizzle_migrations` table and skip files that are already recorded. It will only apply new, unapplied files. To force a full re-run, you must delete the database (or at minimum drop the `drizzle_migrations` table and all the tables created by the migration).

---

## How to Check If Migration Succeeded

### Method 1 — Query the drizzle migrations tracking table

```sql
SELECT * FROM drizzle_migrations ORDER BY created_at;
```

Each row represents a migration file that was successfully applied. If all your SQL files appear here, migration succeeded.

### Method 2 — List the tables

Connect to the database and run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables after db-sample migration:

| Table | Created by |
|---|---|
| `audit_log` | `0000_left_ben_grimm.sql` |
| `award` | `0000_left_ben_grimm.sql` |
| `categories` | `0000_left_ben_grimm.sql` |
| `country` | `0000_left_ben_grimm.sql` |
| `fga_config` | `0000_left_ben_grimm.sql` |
| `hard_delete_log` | `0000_left_ben_grimm.sql` |
| `permissions` | `0000_left_ben_grimm.sql` |
| `role_permissions` | `0000_left_ben_grimm.sql` |
| `roles` | `0000_left_ben_grimm.sql` |
| `state` | `0000_left_ben_grimm.sql` |
| `student` | `0000_left_ben_grimm.sql` |
| `student_subject` | `0000_left_ben_grimm.sql` |
| `subject` | `0000_left_ben_grimm.sql` |
| `t4t_audit_logs` | `0000_left_ben_grimm.sql` |
| `tenants` | `0000_left_ben_grimm.sql` |
| `user_tenant_roles` | `0000_left_ben_grimm.sql` |
| `users` | `0000_left_ben_grimm.sql` |

### Method 3 — Run the API healthcheck

Start the database server (`npm run serve`), then start `apps/sample-api` and call:

```
GET http://127.0.0.1:3000/api/healthcheck
```

If the backend starts and the healthcheck returns 200, the database connection is working.

### Method 4 — Drizzle Studio (visual browser UI)

```powershell
cd scripts/dbdeploy/db-sample
npx drizzle-kit studio
```

This opens a local browser UI where you can browse tables and data.

---

## Database Serve Commands

### db-sample (currently working)

```powershell
cd scripts/dbdeploy
npm run serve
```

- Starts PGlite from `db-sample/dev.db/`
- Listens on `127.0.0.1:55432`
- Both `apps/sample-api` and the migration/seed scripts connect to this port

### db-iam (not yet implemented)

`serve-db.ts` currently only serves db-sample. It does not serve db-iam. If db-iam needs a local PGlite instance, a separate serve command would be needed:

```typescript
// Hypothetical separate serve for db-iam
const dbIam = new PGlite('./db-iam/dev.db');
const serverIam = new PGLiteSocketServer({ db: dbIam, port: 55433, host: '127.0.0.1' });
```

Or the `serve-db.ts` script could be updated to serve both databases on different ports.

For instance-based (real postgres), no serve command is needed — just set `DATABASE_URL` to the instance connection string.

---

## Port Reference and Inconsistencies

### Port Convention

| Database | Mode | Port | Notes |
|---|---|---|---|
| db-sample | Local PGlite (socket server) | **55432** | `serve-db.ts` listens here |
| db-sample | Instance / real postgres | **5432** | Standard postgres default |
| db-iam | Local PGlite (socket server) | **55433** | Will be added to `serve-db.ts` |
| db-iam | Instance / real postgres | **5433** | Separate postgres instance from db-sample |

The high-numbered ports (55432, 55433) are used locally so PGlite does not conflict with any real postgres server that may already be running on 5432/5433.

---

### db-sample — All Files With Port References

| File | Current value | Correct value | Committed? | Status |
|---|---|---|---|---|
| `scripts/dbdeploy/serve-db.ts` | `55432` | `55432` | Yes | Correct |
| `scripts/dbdeploy/db-sample/drizzle.config.ts` | fallback `5432` | fallback `5432` | Yes | Acceptable — fallback is for instance use, not local |
| `scripts/dbdeploy/db-sample/.env` | `5432` | `55432` (local) | **No** (gitignored) | Wrong — local-only file, needs manual fix |
| `apps/sample-api/.env.local` | `55432` | `55432` | Yes | Correct |
| `apps/sample-api/.env` | `55432` | `55432` | **No** (gitignored) | Correct |
| `docs/env-guide.md` line 52 | `5432` for local PGlite | `55432` | Yes | **Wrong in docs** — says 5432 but PGlite is on 55432 |
| `docs/env-guide.md` line 60 | `5432` | `55432` | Yes | **Wrong in docs** |
| `docs/env-guide.md` line 168 | `5432` | `55432` | Yes | **Wrong in docs** |
| `docs/setup-first-time.md` Step 5 | mentions `npm run serve` | correct | Yes | Correct |

**Summary for db-sample:**
- `scripts/dbdeploy/db-sample/.env` — gitignored, wrong port locally, fix manually
- `docs/env-guide.md` — committed, documents the wrong local port in three places, needs to be fixed as part of Phase 5

---

### db-iam — Files to Create, With Correct Ports

These files do not exist yet. When created, use the following ports:

| File | Port to use | Mode |
|---|---|---|
| `scripts/dbdeploy/db-iam/drizzle.config.ts` | fallback `5433` | Instance default (same pattern as db-sample's fallback `5432`) |
| `scripts/dbdeploy/db-iam/.env` | `55433` | Local PGlite (this file will be gitignored — add to `db-iam/.gitignore`) |
| `scripts/dbdeploy/serve-db.ts` (updated) | `55433` | Local PGlite socket for db-iam |

The `db-iam/.env` uses 55433 for local. When deploying to a real instance, set `DATABASE_URL` to the real postgres URL (with port 5433 or whatever the instance uses) via environment variables — same pattern as db-sample.

---

### What Needs to Change in Committed Files

Only two committed files have wrong ports that need to be fixed as part of this issue:

1. **`docs/env-guide.md`** — three lines reference `5432` as the local PGlite port for `DATABASE_URL`. Should be `55432`.

2. **`scripts/dbdeploy/db-sample/drizzle.config.ts`** — the fallback URL `postgresql://localhost:5432/dev` is used when `DATABASE_URL` is not set. This is fine for instance use but will silently point to the wrong port for a developer who forgets to set the env var locally. Optional: change fallback to `55432` or add a comment noting that `DATABASE_URL` must be set for local use.

The `db-sample/.env` (wrong port `5432`) is gitignored and not pushed — it is a local-only issue that needs to be fixed manually on each machine.

---

## Implementation Plan

### Phase 1 — Fix broken seed files (db-sample) — HIGHEST PRIORITY

Convert the three broken seed files to use the drizzle API. The `seed.ts` runner already passes a drizzle `NodePgDatabase` instance — the seed files just need to use it correctly.

1. `seeds/initial_users.ts` — convert to drizzle
   - Remove `import type { Knex } from 'knex'`
   - Change signature to `(db: NodePgDatabase<any>): Promise<void>`
   - Replace `knex('users').del()` → `db.delete(schema.users)`
   - Replace `knex('users').insert([...])` → `db.insert(schema.users).values([...])`

2. `seeds/initial_testdata.ts` — convert to drizzle
   - Same pattern, but references `student`, `country`, `state`, `award`, `subject`, `student_subject`
   - The `icc.json` and `state.json` imports stay as-is

3. `seeds/initial_rbac.ts` — convert to drizzle
   - References `tenants`, `permissions`, `roles`, `role_permissions`, `user_tenant_roles`

4. Fix `db-sample/.env` — change port from 5432 to 55432 and match the app's connection string

### Phase 2 — Add missing raw SQL to drizzle migrations (db-sample)

Create `db-sample/drizzle/0001_functions_and_triggers.sql` by hand with:
- `audit_trigger_func()` PL/pgSQL function (from `20260415120002_audit_trigger_func.ts`)
- `enforce_append_only()` PL/pgSQL function (from `20260415120003_enforce_append_only_func.ts`)
- `CREATE TRIGGER audit_users` (from `20260415120004_audit_triggers.ts`)
- `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC` and role grants (from `20260415120000_audit_log.ts`)
- `REVOKE ALL ON hard_delete_log FROM PUBLIC` and role grants (from `20260415120001_hard_delete_log.ts`)

Then update `db-sample/drizzle/meta/_journal.json` to add the new file entry.

### Phase 3 — Remove Knex from migration/seed files (db-sample)

1. Delete `db-sample/migrations/` folder (all 9 files)
2. Delete `db-sample/knexfile.ts`
3. Remove `knex-pglite` from `scripts/dbdeploy/package.json` (it was only used by knexfile.ts)
4. Keep `knex` in `scripts/dbdeploy/package.json` only if needed; otherwise remove it too
   - **Note:** `knex` in `common/compiled/node` stays for t4t — do not touch that

### Phase 4 — Set up drizzle for db-iam

The goal is to build a setup for db-iam that mirrors what db-sample already has. Every file listed here is a new file that needs to be created.

**Step 1 — Schema file**

Create `db-iam/schema.ts` with drizzle table definitions for all 11 IAM tables. Use the existing `20260101000000_identity.ts` Knex migration as a reference — do not run it. Tables needed:
- `users` (UUID PK, different from db-sample's integer users)
- `user_credentials`
- `user_mfa_totp`
- `user_mfa_recovery_codes`
- `user_otp_challenges`
- `user_federated_identities`
- `rsa_signing_keys`
- `user_sessions`
- `roles`
- `user_roles`
- `auth_audit_log`

**Step 2 — Drizzle config**

Create `db-iam/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:55433/db_iam',
  },
});
```

**Step 3 — Environment file**

Create `db-iam/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55433/db_iam
```
(Port 55433 for local PGlite; change to real postgres URL for instance-based.)

**Step 4 — Generate the SQL migration**

Run `npx drizzle-kit generate` from inside `db-iam/`. This produces `db-iam/drizzle/0000_identity.sql`.

**Step 5 — Add raw SQL file for triggers**

Create `db-iam/drizzle/0001_updated_at_triggers.sql` by hand. Copy the `set_updated_at()` trigger function and all per-table `updated_at` triggers from `identity-schema.sql`. Register this file in `db-iam/drizzle/meta/_journal.json`.

**Step 6 — Seed runner**

Create `db-iam/seed.ts` — same pattern as `db-sample/seed.ts`:
```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
// import seed functions from ./seeds/

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// run seeds...

await pool.end();
```

**Step 7 — Seed files**

Create `db-iam/seeds/` with at least:
- `initial_roles.ts` — inserts the three system roles (`superadmin`, `admin`, `user`) that are hardcoded in the Knex migration

Additional seed files (admin user etc.) can be added as needed.

**Step 8 — Package scripts**

Add to `scripts/dbdeploy/package.json`:
```json
"db:iam:generate": "cd db-iam && drizzle-kit generate",
"db:iam:migrate": "cd db-iam && drizzle-kit migrate",
"db:iam:seed":    "node --env-file=db-iam/.env db-iam/seed.ts"
```

**Step 9 — Local serve (PGlite)**

Update `serve-db.ts` to also serve `db-iam/dev.db` on port `55433`:
```ts
// existing db-sample on 55432 stays unchanged
const dbIam = new PGlite('./db-iam/dev.db');
const serverIam = new PGLiteSocketServer({ db: dbIam, port: 55433, host: '127.0.0.1' });
await serverIam.start();
console.log('[serve-db] IAM listening on 127.0.0.1:55433');
```
Both databases are served by the same `npm run serve` command.

### Phase 5 — Update documentation

1. Rewrite `scripts/dbdeploy/READMD.md`:
   - Remove all `npx knex ...` commands
   - Document the new drizzle-kit commands for both db-sample and db-iam
   - Explain local vs instance-based usage

2. Update `docs/setup-first-time.md` Step 4:
   - Replace `npx knex --knexfile db-sample/knexfile.js migrate:latest` → `npm run db:migrate`
   - Replace `npx knex --knexfile db-sample/knexfile.js seed:run` → `npm run seed`

### Phase 6 — Test end-to-end

1. Delete `db-sample/dev.db` to start fresh
2. Run `npm run serve` to start PGlite
3. Run `npm run db:migrate` — verify it applies both SQL files with no errors
4. Run `npm run seed` — verify all 4 seeds complete
5. Start `apps/sample-api` and call `GET /api/healthcheck`
6. Repeat steps 1–3 for db-iam once that is implemented

---

## Summary of What To Leave Alone

| Thing | Why |
|---|---|
| `common/compiled/node/services/db/knex.ts` | Used by t4t runtime feature — do not touch |
| `common/compiled/node/package.json` `knex` dep | Required for t4t — do not remove |
| `apps/sample-api/.env.json` `KNEXFILE_PG` / `KNEXFILE_MYSQL` | Kept for t4t backward compatibility (commented out in SERVICES_CONFIG) |
| `scripts/dbdeploy/package.json` — no need to add drizzle-kit explicitly | drizzle-kit is hoisted from the workspace root and is accessible |
