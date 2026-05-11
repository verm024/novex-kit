# Environment Variables Guide

This guide covers every env variable in the project — where it lives, what it does, and whether you need to ask your manager or set it yourself.

---

## Overview of Env Files

| File | Location | What it is |
|---|---|---|
| `.env` | `apps/sample-api/.env` | Secrets for the backend. **Gitignored — you create this.** |
| `.env.local` | `apps/sample-api/.env.local` | Template for `.env`. Already in the repo. Copy this to create `.env`. |
| `.env.json` | `apps/sample-api/.env.json` | Non-secret structured config for the backend. Already in repo. |
| `.env.development` | `apps/sample-vue-full/.env.development` | Config for the full Vue frontend in dev mode. Already in repo. |
| `.env.development` | `apps/sample-vue-minimal/.env.development` | Config for the minimal Vue frontend in dev mode. Already in repo. |

---

## Checking if an env file exists

```powershell
# Check backend .env
Test-Path apps/sample-api/.env

# Check Vue full
Test-Path apps/sample-vue-full/.env.development

# Check Vue minimal
Test-Path apps/sample-vue-minimal/.env.development
```

`True` = file exists. `False` = file is missing, follow the steps below.

---

## File 1 — `apps/sample-api/.env`

This is the secrets file for the backend. It is **not committed to git** (gitignored).

### How to create it

```powershell
Copy-Item apps/sample-api/.env.local apps/sample-api/.env
```

Then edit `apps/sample-api/.env`.

### Variables

| Variable | Example Value | Ask Manager? | Notes |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | **Yes (for staging/prod DB)** | For local dev using PGlite, use `postgresql://postgres:postgres@localhost:5432/db_express?sslmode=disable`. Ask manager for any real server URL. |
| `DEV_SECRET` | `'{"aa": "1"}'` | No — set yourself | Development-only placeholder secret. Any value works for local dev. |
| `NODE_ENV` | `development` | No — set yourself | Set to `development` on your machine. |
| `API_PORT` | `3000` | No — set yourself | Port the Express server will listen on. `3000` is the default. |

### Minimum contents for local dev

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/db_express?sslmode=disable
NODE_ENV=development
API_PORT=3000
DEV_SECRET='{"key": "local-dev-only"}'
```

---

## File 2 — `apps/sample-api/.env.json`

This file is **already in the repo**. You do not create it. You only need to fill in specific fields.

Most values have working defaults for local development. The ones below are the only ones you may need to change.

### Variables you set yourself (local dev defaults are fine)

| Key | Default | Notes |
|---|---|---|
| `API_PORT` | (set in `.env`) | Port config comes from `.env`, not here |
| `CORS_OPTIONS.origin` | `["http://127.0.0.1:8080", ...]` | Add your Vue frontend URL if you change the port |
| `COOKIE_OPTS.sameSite` | `"lax"` | Fine as-is for local dev |
| `COOKIE_OPTS.secure` | `false` | Change to `true` only for HTTPS in production |
| `JWT.JWT_EXPIRY_SEC` | `"45m"` | How long access tokens last |
| `JWT.JWT_REFRESH_EXPIRY_SEC` | `3600` | How long refresh tokens last (seconds) |
| `KEYV_CACHE` | `{}` | Empty means in-memory cache. Fine for local dev. |
| `REDIS_CONFIG` | `""` | Leave empty to skip Redis for local dev |
| `FGA_CONFIG.storeId` | `""` | Leave empty to disable fine-grained auth (uses DB roles instead) |
| `RBAC_CONFIG.enabled` | `false` | Leave false unless your DB has the RBAC tables migrated |

### Variables you MUST ask your manager for

These are values that contain real credentials, certificates, or secrets from external services. You cannot generate or guess them yourself.

| Key | What it is | Why you need to ask |
|---|---|---|
| `OIDC_OPTIONS.CLIENT_SECRET` | OIDC provider (e.g. Keycloak) client secret | Issued by the IdP, not something you create |
| `OIDC_OPTIONS.URL` | OIDC provider URL | Depends on which IdP the team uses |
| `OIDC_OPTIONS.CLIENT_ID` | OIDC client ID | Registered on the IdP |
| `OIDC_OPTIONS_ORG.CLIENT_SECRET` | Org OIDC client secret | Same — issued by the org IdP |
| `OIDC_OPTIONS_ORG.URL` | Org OIDC provider URL | Org-specific |
| `OAUTH_OPTIONS.CLIENT_SECRET` | OAuth app secret (e.g. GitHub OAuth app) | Issued by the OAuth provider |
| `OAUTH_OPTIONS.CLIENT_ID` | OAuth app client ID | Issued by the OAuth provider |
| `SAML_PRIVATE_KEY.privateKey` | SAML Service Provider private key | Generated and managed by the security/infra team |
| `SAML_PRIVATE_KEY.decryptionPvk` | SAML decryption private key | Same as above |
| `SAML_OPTIONS.idpCert` | SAML Identity Provider certificate | Downloaded from the IdP metadata URL |
| `SAML_OPTIONS.entryPoint` | SAML IdP SSO endpoint URL | Provided by the IdP or manager |
| `SAML_OPTIONS_ORG.idpCert` | Org SAML IdP certificate | Same — from org IdP metadata |

> **Note:** If you are only doing local development and do not need SSO login (SAML/OIDC/OAuth), you can leave all of these as their placeholder values. The app will still run. SSO features will not work until these are filled in.

---

## File 3 — `apps/sample-vue-full/.env.development`

This file is **already in the repo**. You do not create it. Most values are already filled correctly for local development.

### Variables

| Variable | Default Value | Ask Manager? | Notes |
|---|---|---|---|
| `VITE_API_URL` | `http://127.0.0.1:3000` | No | Points to your local backend. Only change if your backend runs on a different port or host. |
| `VITE_WITH_CREDENTIALS` | `include` | No | Leave as `include` when backend is on a different port (cross-origin). |
| `VITE_SENTRY_DSN` | _(empty)_ | **Yes** | The DSN for the Sentry error monitoring project. Ask your manager or the DevOps/monitoring team. Leave empty to disable Sentry in local dev. |
| `VITE_WS_URL` | _(empty)_ | No | WebSocket URL. Leave empty to disable WebSockets for local dev. Fill in if you need to test WS features. |
| `VITE_WS_MS` | `5000` | No | WebSocket reconnect interval in ms. Fine as-is. |
| `VITE_REFRESH_URL` | `/api/auth/refresh` | No | Token refresh endpoint. Do not change unless the backend route changes. |
| `VITE_LOGOUT_URL` | `/api/auth/logout` | No | Logout endpoint. Do not change unless the backend route changes. |
| `BASE_PATH` | `/` | No | Base URL path of the app. Leave as `/` for local dev. |

---

## File 4 — `apps/sample-vue-minimal/.env.development`

Same structure as above, with a few extra metadata fields.

| Variable | Default Value | Ask Manager? | Notes |
|---|---|---|---|
| `VITE_APP_TITLE` | `Sample2` | No | App title shown in browser tab. Set to your app name. |
| `VITE_APP_DESCRIPTION` | _(placeholder text)_ | No | SEO meta description. Set to your app description. |
| `VITE_APP_KEYWORDS` | _(placeholder words)_ | No | SEO keywords. Set to your app keywords. |
| `VITE_API_URL` | `http://127.0.0.1:3000` | No | Same as above — points to local backend. |
| `VITE_SENTRY_DSN` | _(a placeholder DSN)_ | **Yes (or clear it)** | Contains a placeholder Sentry DSN. Either ask manager for the real one or clear the value to disable Sentry. |
| `VITE_WITH_CREDENTIALS` | `include` | No | Same as above. |
| `VITE_REFRESH_URL` | `/api/auth/refresh` | No | Same as above. |
| `BASE_PATH` | `/` | No | Same as above. |

---

## Summary — Ask Manager vs Set Yourself

### Ask your manager for these

| What | Where |
|---|---|
| Database connection URL (staging/prod) | `apps/sample-api/.env` → `DATABASE_URL` |
| OIDC client ID and secret | `apps/sample-api/.env.json` → `OIDC_OPTIONS` |
| OIDC provider URL | `apps/sample-api/.env.json` → `OIDC_OPTIONS.URL` |
| Org OIDC client ID, secret, URL | `apps/sample-api/.env.json` → `OIDC_OPTIONS_ORG` |
| OAuth app client ID and secret | `apps/sample-api/.env.json` → `OAUTH_OPTIONS` |
| SAML private key and decryption key | `apps/sample-api/.env.json` → `SAML_PRIVATE_KEY` |
| SAML IdP certificate and entry point URL | `apps/sample-api/.env.json` → `SAML_OPTIONS` |
| Org SAML IdP certificate | `apps/sample-api/.env.json` → `SAML_OPTIONS_ORG` |
| Sentry DSN | `apps/sample-vue-full/.env.development` → `VITE_SENTRY_DSN` |

### Set yourself (no manager needed)

| What | Where | Value for local dev |
|---|---|---|
| `DATABASE_URL` | `apps/sample-api/.env` | `postgresql://postgres:postgres@localhost:5432/db_express?sslmode=disable` |
| `NODE_ENV` | `apps/sample-api/.env` | `development` |
| `API_PORT` | `apps/sample-api/.env` | `3000` |
| `DEV_SECRET` | `apps/sample-api/.env` | any placeholder JSON string |
| `VITE_API_URL` | Vue `.env.development` files | `http://127.0.0.1:3000` |
| `VITE_APP_TITLE` | `apps/sample-vue-minimal/.env.development` | your app name |
| CORS origins in `.env.json` | `apps/sample-api/.env.json` | match your Vue port (`8080` / `8081`) |
| All other `.env.json` values | `apps/sample-api/.env.json` | defaults are fine for local dev |

---

## Important Rules

- **Never commit `.env`** — it is gitignored for a reason. It contains secrets.
- **Never put secrets in `.env.json`** — it is committed to git. Only put non-sensitive config there.
- For production deployments, secrets are injected via the deployment platform (Kubernetes secrets, Docker env, CI/CD vault). The `.env` file is not used in production.
