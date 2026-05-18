# T4T Architecture: Complete Investigation

## 1. High-Level Concept — What Is T4T?

**Confirmed from codebase.** The README at common/compiled/node/t4t/README.md defines it as:

> **T4T Configuration Based Table Editor For Express**

T4T is an **internal framework** for building data management UIs without writing code per table. You write a **YAML config file** describing one database table — its columns, their types, their permissions, and their UI behavior — and T4T generates:

- A fully functional REST API backend with CRUD, filtering, sorting, pagination, CSV import/export, and file upload.
- A fully functional frontend table view + form, driven by that same config.

Think of it as an **admin panel generator** that is driven by configuration rather than code.

---

## 2. Purpose and Problems It Solves

Without T4T, every data management table requires:
- A hand-written backend controller with `find`, `findOne`, `create`, `update`, `delete` handlers.
- Hand-written SQL/Knex queries.
- A hand-written frontend table component.
- A hand-written form component with field-by-field UI rendering.
- Repeated permission checks on both frontend and backend.

T4T replaces all of that with **one YAML file per table**.

---

## 3. Important File Map

```
common/compiled/node/t4t/
├── t4t.ts           # Express router: URL routing + per-request YAML loading + permission resolution
├── t4t-base.ts      # Generic CRUD handlers: find, findOne, create, update, remove, upload
├── t4t-utils.ts     # Utilities: roleOperationMatch, isInvalidInput, mapRelation, kvDb2Col, formUniqueKey, setAuditData
├── types.ts         # TypeScript types: ColDef, TableDef, T4TRequest, RelationDef, etc.
├── index.ts         # Registration helper: mounts the T4T router onto the Express app
├── t4t.http         # HTTP test file for manual API testing
├── README.md        # TODO list and notes from the author
├── tables/          # YAML config files, one per managed table
│   ├── student.yaml
│   ├── subject.yaml
│   ├── student_subject.yaml
│   ├── country.yaml
│   ├── state.yaml
│   ├── award.yaml
│   ├── audit_logs.yaml
│   └── users.yaml
└── custom/
    └── index.ts     # Custom CRUD override for the "country" table (upload creates state rows too)

common/vanilla/web/
├── t4t-fe.js        # Frontend client library: setTableName, getConfig, find, findOne, create, update, remove, upload, autocomplete
└── bwc-t4t-form.js  # Web Component <bwc-t4t-form>: renders a dynamic form from T4T config

apps/sample-vue-full/
├── views/T4t.vue    # Vue component: full table + filter drawer + form drawer (uses Ant Design Vue)
├── views/T4t.css    # Styles for T4t.vue
└── setups/routes.js # Registers T4T routes: /t4t-student, /t4t-subject, /audit-logs, /t4t-link/:table

apps/sample-api/public/vue-nobundler/
└── views/ui4.js     # No-bundler demo: bwc-table + bwc-t4t-form using vanilla web components
```

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (sample-vue-full)                                         │
│                                                                     │
│  Router: /t4t-student  ──props: tableName="student"──▶ T4t.vue      │
│  Router: /t4t-subject  ──props: tableName="subject"──▶ T4t.vue      │
│  Router: /t4t-link/:table ──▶ T4t.vue  (child table navigation)     │
│                                                                     │
│  T4t.vue                                                            │
│  ├── onMounted: t4tFe.setTableName(tableName)                       │
│  │             t4tFe.getConfig()  ──────────────────────────────┐   │
│  ├── renders columns, filter cols, form cols from config        │   │
│  ├── fetchData: t4tFe.find(filters, sorter, page, pageSize)     │   │
│  ├── formOpen: t4tFe.findOne(__key)                             │   │
│  ├── formSubmit: t4tFe.create() or t4tFe.update()              │   │
│  ├── deleteItems: t4tFe.remove(selectedKeys)                    │   │
│  ├── importCsv: t4tFe.upload(file)                              │   │
│  └── exportCsv: t4tFe.download(filters, sorter)                 │   │
│                                                                 │   │
│  t4t-fe.js (client library)                                     │   │
│  ├── state: tableName, urlPrefix (/api), http instance          │   │
│  └── all calls go to /api/t4t/<operation>/<tableName>           │   │
└─────────────────────────────────────────────────────────────────┼───┘
                                                                  │
                          HTTP (JSON/multipart)                   │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND (common/compiled/node/t4t/)                                │
│                                                                     │
│  Express Router at /api/t4t                                         │
│  ├── GET  /healthcheck                                              │
│  ├── GET  /config/:table  ──▶ generateTable ──▶ return table obj    │
│  ├── POST /autocomplete/:table  ──▶ generateTable ──▶ Knex query    │
│  ├── GET  /find/:table  ──▶ generateTable ──▶ base/custom.find()    │
│  ├── GET  /find-one/:table  ──▶ generateTable ──▶ base/custom.findOne()│
│  ├── PATCH /update/:table ──▶ generateTable ──▶ base/custom.update()│
│  ├── POST /create/:table  ──▶ generateTable ──▶ base/custom.create()│
│  ├── POST /remove/:table  ──▶ generateTable ──▶ base/custom.remove()│
│  └── POST /upload/:table  ──▶ generateTable ──▶ base/custom.upload()│
│                                                                     │
│  generateTable middleware (runs on every request):                   │
│  1. reads YAML file from CONFIGS_FOLDER_PATH/<tableName>.yaml        │
│  2. applies role-based permissions (view, create, update, delete...) │
│  3. marks field-level permissions (col.editor, col.creator)          │
│  4. builds pk, multiKey, required, auto arrays                       │
│  5. attaches result as req.table                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼  Knex query builder
┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE (via services.get('knex1'))                               │
│  SQLite (dev.sqlite3) / PostgreSQL / MySQL                          │
│  Tables: student, subject, student_subject, country, state, etc.    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Entry Points

### Backend Entry Point

The registration happens in common/compiled/node/t4t/index.ts:

```ts
export default ({ app, routePrefix }) => {
  app.use(routePrefix, router.use('/', t4t({ authFunc: mockAuthUser })));
};
```

You call this function from your app's route registration, passing `routePrefix = '/api/t4t'`. The .env.json in `sample-api` configures `CONFIGS_FOLDER_PATH: "./apps/app-t4t/tables/"` — this is where the YAML files are read from at runtime. (The `tables/` folder inside the library serves as the example/reference.)

**Confirmed:** The current `sample-api` does NOT yet mount T4T routes in its src/routes/index.ts. The T4T module is available but must be explicitly wired up. The .env.json has the `T4T` config block ready, but the registration call is not present in `sample-api`'s current app.ts. This is a gap in the sample app integration.

### Frontend Entry Point

In apps/sample-vue-full/setups/routes.js:

```js
{ path: '/t4t-student', name: 'T4t - Student',
  component: async () => import('../views/T4t.vue'),
  props: { tableName: 'student' }
}
```

The `tableName` prop is passed to T4t.vue, which sets it on `t4tFe` and fetches the config from the server. Every route that points to T4t.vue with a different `tableName` becomes a fully functional CRUD page for that table — zero additional code.

---

## 6. Detailed Request Lifecycle — Example: User Opens the Student Page

**Step 1 — Route loads T4t.vue with `props.tableName = 'student'`.**

**Step 2 — `onMounted` runs:**
```js
t4tFe.setTableName('student');          // sets internal state in t4t-fe.js
table.config = await t4tFe.getConfig(); // GET /api/t4t/config/student
```

**Step 3 — Server handles `GET /api/t4t/config/student`:**
1. `authUser` middleware checks authentication.
2. `generateTable` middleware runs:
   - Reads `<CONFIGS_FOLDER_PATH>/student.yaml` from disk.
   - Parses YAML with `js-yaml`.
   - Reads user's roles from `req.user.roles`.
   - Calls `roleOperationMatch(userRoles, tableConfig.view)` → `true` if user has `admin`, `editor`, or `viewer` role.
   - Same check for `create`, `update`, `delete`, `import`, `export`.
   - For each column, checks `col.editor` and `col.creator` against user roles.
   - Builds `req.table.pk`, `req.table.multiKey`, `req.table.required`, `req.table.auto` arrays.
   - Attaches `req.table` to the request.
3. Handler returns `res.json(req.table)` — the full enriched config.

**Step 4 — T4t.vue builds the table columns from config:**
```js
for (const key in table.config.cols) {
  const val = table.config.cols[key];
  const column = { title: val.label, dataIndex: key, ... };
  if (!val.hide) table.columns.push(column);
}
```

**Step 5 — `fetchData` runs: `GET /api/t4t/find/student?page=1&limit=10`**

**Step 6 — Server `find` handler (in t4t-base.ts):**
1. Checks `req.table.view` — throws 403 if false.
2. Parses `filters`, `sorter`, `page`, `limit` from query params.
3. Builds a Knex query: `svc.get('knex1')('student').where({})`.
4. For each column that has `options.foreignKey` (autocomplete columns), adds a `leftOuterJoin`.
5. Runs `query.count()` for total, then `query.limit(limit).offset(...)` for rows.
6. Calls `kvDb2Col` to format dates, apply `hide: omit/blank`, and merge join columns.
7. Adds `__key = row[pk]` to each row (the identity key used by the frontend for edit/delete).
8. Returns `{ results, total }`.

**Step 7 — User clicks a row → `formOpen(record)`:**
1. Calls `t4tFe.findOne(record.__key)` → `GET /api/t4t/find-one/student?__key=1`.
2. Server builds a WHERE from `formUniqueKey(table, '1')` → `{ 'student.id': 1 }`.
3. Returns the full row.
4. T4t.vue iterates `table.config.cols`, builds `table.formCols` (only columns where `col.edit` is truthy), populates `table.formData`.

**Step 8 — User clicks Save → `formSubmit()`:**
1. Serializes form data into `FormData` (handles file fields).
2. Calls `t4tFe.update(table.formKey, formData)` → `PATCH /api/t4t/update/student?__key=1`.
3. Server `update` handler:
   - Calls `formUniqueKey` to build WHERE clause.
   - Iterates each field:  if `col.editor === false` → drops the field.  If `col.edit !== true` → drops the field.  Runs `isInvalidInput(col, value)` for validation.
   - Handles `col.auto === 'user'` → overrides value with `req.user.sub`.
   - Handles `col.auto === 'ts'` → overrides value with `new Date().toISOString()`.
   - Runs the Knex UPDATE inside a transaction.
4. Returns `{ count: 1 }`.

---

## 7. YAML Config System — Full Breakdown

This is **the single most important concept** in T4T. Each YAML file drives everything. Here is what each field means, confirmed from student.yaml and types.ts:

```yaml
conn: knex1           # which DB connection (must be a Knex connection, not Drizzle)
name: student         # exact DB table name used in all Knex queries
displayName: Students # UI heading

# Table-level permissions (comma-separated roles, or true/false)
view: admin,editor,viewer
create: admin
update: admin,editor
delete: admin
import: admin,editor  # CSV bulk import
export: admin,editor  # CSV bulk export

deleteLimit: 1        # max rows deletable in one delete call. -1 = unlimited
multiSelect: false    # whether table supports multi-row checkbox selection
audit: true           # whether to write to audit_logs table on changes
defaultSort: []       # [{column, order}] applied when no sorter is active

cols:
  id:
    label: ID
    auto: pk           # this column is the primary key (auto-incremented, never editable)
    hide: true         # omit from returned data and table display

  firstName:
    label: First Name
    required: true
    add: true          # show in the Add form (true = editable, readonly = disabled)
    edit: true         # show in the Edit form
    creator: admin     # additional per-field role check for create operations
    editor: admin      # additional per-field role check for edit operations
    filter: true       # show this column in the filter panel
    sort: true         # allow sorting by this column
    default: ''        # default value when opening Add form
    type: string       # data type: string, integer, decimal, datetime, date, time, boolean, link
    ui:
      tag: input       # UI element type: input, textarea, select, autocomplete, files, bwc-combobox
      attrs:
        type: text
        pattern: '^[A-Za-z]+$'
        maxlength: 20

  avatar:
    label: Avatar
    add: true
    edit: true
    type: string
    ui:
      url: http://127.0.0.1:3000/uploads/avatar/  # base URL for displaying the file
      tag: files        # triggers file upload UI + multer storage
      attrs:
        multiple: false
        accept: image/*,.pdf,.txt
        maxCount: 1
      multer:
        folder: apps/sample-api/uploads/avatar   # disk destination
        options:
          limits:
            files: 1
```

### Relation / Autocomplete Column Config

The most complex part. From how student.yaml would reference a country, the `options` block (confirmed from `t4t-utils.ts mapRelation`):

```yaml
countryId:
  label: Country
  type: integer
  ui:
    tag: autocomplete    # or bwc-combobox
  options:
    foreignKey: countryId     # the column in THIS table that holds the FK value
    tableName: country        # the related table to JOIN/search
    key: id                   # the PK of the related table
    text: name                # the display column of the related table
    column: name              # same as text in most cases
    joinFromTable: student    # which table the join originates from
```

When `mapRelation` returns a valid relation, t4t-base.ts automatically adds:
```js
query.leftOuterJoin('country', 'student.countryId', '=', 'country.id')
```
and includes `country.name as countryId_name` in the SELECT.

`kvDb2Col` then merges this back to: `row.countryId = { key: 1, text: 'Malaysia' }`.

The frontend `autocomplete` function calls `POST /api/t4t/autocomplete/country` with `{ key: 'id', text: 'name', search: 'mal' }` and the backend does a `LIKE` query on the related table.

---

## 8. Frontend — Two Implementations

### Implementation A: Vue-Bundled (T4t.vue + Ant Design Vue)

Found in apps/sample-vue-full/views/T4t.vue.

- Uses `<a-table>`, `<a-drawer>`, `<a-form-item>`, `<a-upload>` from Ant Design Vue.
- All state lives in a single `reactive` object called `table`.
- The filter drawer slides in from the left (`placement="left"`).
- The edit/create form is also a drawer.
- This is the primary, well-developed implementation.

### Implementation B: Vanilla / No-Bundler (`bwc-table` + `bwc-t4t-form`)

Found in apps/sample-api/public/vue-nobundler/views/ui4.js.

- Uses the `<bwc-table>` and `<bwc-t4t-form>` web components.
- The form web component is defined in common/vanilla/web/bwc-t4t-form.js as a native `HTMLElement` (`customElements.define('bwc-t4t-form', BwcT4tForm)`).
- Supports Bulma, Bootstrap, and MUI CSS frameworks (each has a layout template in the JS).
- The comment in the file says it is "not very good" (confirmed by manager's statement).

---

## 9. Database Access — Knex vs Drizzle

**Confirmed critical finding:** T4T uses **Knex**, not Drizzle.

From common/compiled/node/t4t/t4t-base.ts, every query:
```ts
svc.get(table.conn)(table.name).where(...)
```
`svc.get('knex1')` returns a `StoreKnex` instance (from common/compiled/node/services/db/knex.ts).

The .env.json comment says explicitly:
```json
// "knex1": { "type": "knex", "options": "KNEXFILE_PG" }, // legacy — keep for t4t if needed
```

The rest of `sample-api` has migrated to Drizzle (`drizzle1`). **T4T is the only remaining consumer of Knex in this codebase.**

---

## 10. Custom Override System

The custom/index.ts file is a per-table escape hatch. It overrides only the `upload` operation for the `country` table — when uploading a CSV of countries, it also automatically creates rows in the `state` table.

In t4t.ts, the dispatch looks like:
```ts
return custom[t4tReq?.table?.name]?.find
  ? custom[t4tReq.table.name].find(t4tReq, res)
  : base.find(t4tReq, res);
```

So for any table name, you can replace any of: `find`, `findOne`, `create`, `update`, `remove`, `upload`. If no custom exists, `base` handles it.

---

## 11. Permission System — How Role Checks Work

All confirmed from t4t-utils.ts `roleOperationMatch`:

```ts
export const roleOperationMatch = (role: string, operation: string | boolean, col = null): boolean => {
  if (typeof operation === 'boolean') return operation;
  const operations = operation.split(',');
  const roles = role.split(',');
  for (const _role of roles) {
    for (const _operation of operations) {
      if (_operation === _role) return true;
    }
  }
  return false;
};
```

- **Table-level permission** (e.g., `view: admin,editor,viewer`): Checked in `generateTable` middleware. If `roleOperationMatch` returns false, the field in `req.table` is set to `false`. The CRUD handler then throws `'Forbidden'`.
- **Field-level permission** (`creator: admin` / `editor: admin`): Checked in `generateTable`. Sets `col.editor = false` or `col.creator = false`. In `update`, if `col.editor === false`, the field is silently dropped from the update body. In `create`, if `col.creator === false`, the field is dropped.
- The user object is read from `req.user` (set by auth middleware). The role key is hardcoded as `'roles'` in t4t.ts.

---

## 12. Current Technical Debt and Weaknesses

These are confirmed observations from the code, not assumptions.

### 1. YAML Config Duplicates Database Schema
Every column in a YAML file (`name`, `type`, `required`, `multiKey`) already exists in the Drizzle schema. The two are maintained separately and can drift. There is no validation that checks whether the YAML columns match the actual database table.

### 2. Knex Dependency is a Backwards Compatibility Island
All other services use Drizzle. T4T requires Knex. The comment in .env.json confirms: `"legacy — keep for t4t if needed"`. This means T4T cannot benefit from Drizzle's type safety, generated types, or schema introspection.

### 3. Config File Loaded on Every Request
In `generateTable`, the YAML file is read from disk with `fs.readFileSync` on **every single API request**. There is no caching. For high-traffic scenarios this is an I/O bottleneck. (The TODO comment in the code says: `// TODO get config info from a table` — suggesting DB-backed config was considered.)

### 4. `CONFIGS_FOLDER_PATH` is Globally Configured
All table configs must live in a single folder. If two features need different configs for the same table name, there is no namespace isolation.

### 5. Role System is a Simple String Comparison
Roles are comma-separated strings compared with exact match. There is no role hierarchy, inheritance, or negation. `admin,editor` does not automatically include subsets.

### 6. `CUSTOM_PATH` is Never Actually Used
In t4t.ts:
```ts
const custom: Record<...> = {};
// const custom = CUSTOM_PATH ? (await import(CUSTOM_PATH)).default : { };
// const custom = CUSTOM_PATH ? require(CUSTOM_PATH) : { }
```
The two lines that would load custom handlers from `CUSTOM_PATH` are commented out. Only `custom/index.ts` (compiled in) is used. The `CUSTOM_PATH` env var is dead code.

### 7. Relation Config is Verbose and Manual
Every autocomplete/FK column requires 5–6 options fields in YAML. These could be inferred from the database FK definition.

### 8. Frontend Duplication
There are two separate frontend implementations (T4t.vue for Vue-bundled, bwc-t4t-form.js for no-bundler). They implement the same logic independently and will diverge over time.

### 9. Audit Logging is Set Up But Not Wired
`setAuditData` exists in t4t-utils.ts and is imported in t4t-base.ts, but the audit_logs INSERT call is not visible in the current t4t-base.ts create/update/remove handlers (likely missing or only in a dev branch).

### 10. `link` Type Navigation is Partially Implemented
From T4t.vue:
```js
if (column?.__type === 'link') table.config.cols[key].link?.text; // || 'Click To View'
```
This is a no-op (expression result is discarded). Navigation to child tables via `link` columns works, but the display logic has a bug where the link text is not actually rendered.

---

## 13. Understanding Your Manager's Statements Technically

> **"Use the schema as single source of truth"**

Currently, the Drizzle schema (e.g., `common/compiled/node/services/db/schema.ts`) defines the database structure with types, nullability, and foreign keys. The YAML files re-declare this same information in a different format. "Schema as single source of truth" means: **generate the T4T config from the Drizzle schema**, eliminating the YAML entirely for the parts that can be derived.

**What CAN be derived from Drizzle schema:**
| Property | How to Derive |
|---|---|
| `name` (table name) | from the Drizzle `pgTable('student', ...)` call |
| `cols` (column names) | from the schema object keys |
| `type` (data type) | from Drizzle column types: `integer()` → `integer`, `text()` → `string`, etc. |
| `required` | from `.notNull()` |
| `auto: pk` | from `.primaryKey()` or `.serial()` |
| `multiKey` | from composite PK definitions |
| Relations (FK config) | from `references(() => country.id)` |
| `auto: ts` | from `.defaultNow()` |

**What CANNOT be derived from Drizzle schema:**
| Property | Reason |
|---|---|
| `view/create/update/delete` permissions | No security model in DB schema |
| `creator/editor` per-field permissions | Same |
| `label` (UI label) | Schema names are snake_case identifiers, not human labels |
| `ui.tag` (input type) | A DB `text` column could be an `<input>`, `<textarea>`, or `<select>` |
| `ui.attrs` (min, max, pattern, maxlength) | Frontend validation rules are not in the DB |
| `filter/sort` (show in filter) | UI navigation decision |
| `hide` (omit/blank) | Security/UI decision |
| `deleteLimit` | Business rule |
| `multiSelect` | UI decision |
| `audit` | Business rule |
| `displayName` | UI label |

> **"From FKs we can derive relations"**

This means: if the Drizzle schema has `countryId: integer().references(() => country.id)`, T4T should automatically know that `countryId` is a FK to `country.id`, and can auto-configure the JOIN and autocomplete without requiring the manual `options.foreignKey/tableName/key/text` block in YAML.

**Challenge**: You still need to know which column in `country` to use as the display text (`name`? `code`? `fullName`?). That is metadata not in the FK definition.

> **"How to derive parent and child table relations"**

A "parent" table is the one that owns the FK. A "child" table is the one being referenced. From Drizzle FK definitions: `student` has FK → `country`, so `student` is a child of `country`. The `link` column type in T4T navigates from a parent row to its children (e.g., clicking a student navigates to `/t4t-link/student_subject` filtered by that student's ID). This parent-child navigation cannot be fully derived from FK direction alone — you also need to know which navigation paths are meaningful to expose in the UI.

---

## 14. Relationship to `generate-crud` and the New Code Generator

### What `generate-crud` does (confirmed from codebase)

The script at `scripts/generators/generate-crud.ts` reads the **Drizzle schema** (`common/compiled/node/services/db/schema.ts`) and auto-generates three layers for each table:

| Output file | Description | Overwrite policy |
|---|---|---|
| `schemas/generated/<table>.schema.js` | Zod schemas: `BodySchema`, `UpdateSchema`, `ParamsSchema`, `QuerySchema`, `ResponseSchema` | Always overwritten |
| `src/routes/generated/<table>.ts` | Express router with `authUser` + `validate` middleware wired to each CRUD endpoint | Always overwritten |
| `src/controllers/generated/<table>.ts` | Drizzle-based CRUD handlers using `drizzle1` connection | Always overwritten |
| `schemas/<table>.schema.js` | Sidecar schema (your customizations) | Created once, never overwritten |
| `src/controllers/<table>.ts` | Sidecar controller (your overrides) | Created once, never overwritten |

Currently only `sample-api` uses this generator. The generated routes use **Drizzle** directly (`services.get('drizzle1')`), not Knex.

### Sensitive data handling in `generate-crud`

Confirmed from `apps/sample-api/generate-crud.config.json`: the generator already has a built-in exclusion mechanism:

```json
{
  "exclude": ["fgaConfig"],
  "schemaOnly": ["auditLog", "hardDeleteLog", "t4tAuditLogs"],
  "tables": {
    "users": {
      "excludeFromBody": ["password", "salt", "gaKey", "refreshToken", ...],
      "excludeFromResponse": ["password", "salt", "gaKey", "refreshToken", "smsOtpPin"]
    }
  }
}
```

- `exclude` — tables skipped entirely (e.g. internal FGA config tables).
- `schemaOnly` — tables that get a Zod schema for OpenAPI documentation but **no public routes or controllers**. `auditLog`, `hardDeleteLog`, and `t4tAuditLogs` are already in this list — confirming the design intent that audit tables are documentation-only, not user-editable.
- `excludeFromBody` / `excludeFromResponse` — column-level exclusions. When a column is in `excludeFromResponse`, the generated controller uses an explicit SELECT column list instead of `SELECT *`, so the data is never returned in responses even if it is in the database row.

**Confirmed: the generator already handles sensitive data correctly.** Passwords, salts, OTP pins, and security counters are excluded by config.

### Does current T4T handle sensitive data?

T4T (YAML-based) handles this differently — **and less robustly**:

- In a YAML column definition, setting `hide: omit` causes `kvDb2Col` to delete the field from the response. Setting `hide: blank` replaces it with an empty string.
- There is no equivalent of `excludeFromBody` in T4T YAML. If someone passes a `password` field in a PATCH request body and the YAML column has `edit: true`, the column **will be written to the database**. Protection is entirely the developer's responsibility per YAML config.
- There is no audit of what the T4T YAML configs contain vs. what columns actually exist in the database.

**Conclusion:** the new `generate-crud` approach is safer for sensitive data because exclusions are explicit and enforced at the Zod validation layer before the request even reaches the controller. T4T relies on manual YAML configuration per column.

### Is T4T related to `generate-crud`? Are they the same thing?

**No — they solve the same problem in different ways and at different layers:**

| Aspect | T4T (current) | `generate-crud` (new) |
|---|---|---|
| Config source | Hand-written YAML per table | Auto-generated from Drizzle schema |
| DB access | Knex (`knex1`) | Drizzle (`drizzle1`) |
| Validation | Basic type checking in `isInvalidInput` | Zod schemas (full validation) |
| Permissions | Role strings in YAML | `authUser` JWT middleware only (no per-table roles yet) |
| Frontend | Driven by `/t4t/config/:table` response | No frontend generation (backend only) |
| Filtering/sorting | Generic filter/sort system built into T4T | Not generated — must be added per table |
| CSV import/export | Built in | Not generated |
| File upload | Built in via multer | Not generated |
| Sensitive fields | Manual `hide: omit` in YAML | `excludeFromBody`/`excludeFromResponse` in config JSON |
| OpenAPI | Not generated | Generated via companion `generate-openapi.ts` script |

They are parallel approaches. `generate-crud` produces typed, Drizzle-native, schema-driven backend routes. T4T produces a generic, config-driven backend + frontend combo.

### Can `generate-crud` help the future T4T?

Yes — and this appears to be exactly what your manager is hinting at. The path forward would be:

1. **Use Drizzle schema as source of truth for column definitions** — eliminate the column name, type, required, and FK sections of YAML.
2. **Keep a supplementary YAML/JSON for T4T-only metadata** — labels, permissions, UI tags, filter/sort flags, deleteLimit, etc. (things that cannot be derived from the schema).
3. **Use Drizzle for DB queries** instead of Knex — the generated controller pattern already shows how to do this cleanly.

The generator already proves this is possible: it reads `col.getSQLType()`, `col.notNull`, and FK references from Drizzle columns. A modified T4T could do the same at startup to auto-populate the table config.

### Should you ask your manager about this?

Yes — specifically ask whether the **new T4T** should:
1. Drop YAML entirely and drive everything from Drizzle schema + a minimal supplementary config file.
2. Keep YAML but auto-generate an initial YAML from the schema (like a one-time scaffold).
3. Use `generate-crud` to create the backend routes and have T4T only handle the frontend UI config.

The sensitive-data question is already solved by `generate-crud`'s `excludeFromBody`/`excludeFromResponse` mechanism. If T4T adopts the Drizzle-driven approach, sensitive fields would be excluded at the schema level by default.

---

## 14b. Why the T4T Endpoint Returns 404 (Now Fixed)

**Root cause (now resolved):** The T4T router was not mounted in `sample-api`, and `knex1` was not enabled.

**Fix applied:**

1. `apps/sample-api/src/routes/index.ts` — added:
   ```ts
   import t4tRoutes from '@common/node/t4t/index';
   t4tRoutes({ app, routePrefix: '/api/t4t' });
   ```
   Note: the import uses `@common/node/t4t/index` **without** `.ts`. The package `exports` map in `common/compiled/node/package.json` maps `"./**/*": "./**/*.ts"` — so you write the path without the extension and it resolves to the `.ts` file.

2. `apps/sample-api/.env.json` — uncommented `knex1` in `SERVICES_CONFIG` using `KNEXFILE_PG`:
   ```json
   "knex1": { "type": "knex", "options": "KNEXFILE_PG" }
   ```

3. `apps/sample-api/.env.json` — fixed `CONFIGS_FOLDER_PATH` from the non-existent `./apps/app-t4t/tables/` to `../../common/compiled/node/t4t/tables/`.

4. Set `KNEXFILE_PG` in the `.env` file to the same PostgreSQL connection string as `DRIZZLE_PG` — see Section 14d for the full explanation.

**T4T now runs inside the same Express process as `sample-api`.** There is no separate server to start.

---

## 14c. What Is `vue-nobundler`?

`apps/sample-api/public/vue-nobundler/` is a **frontend application that runs without a build tool** (no Vite, no Webpack, no bundling step).

**Confirmed from the code:**

- It loads Vue and Vue Router directly from CDN via `<script src="https://unpkg.com/vue@3.3.4">` in `index.html`.
- It loads web components (`bwc-table`, `bwc-t4t-form`, `bwc-combobox`, etc.) as ES modules via the `/esm/` static route, which is mapped to `node_modules/@common/iso` in `.env.json`.
- The views are plain `.js` files that export Vue component objects using template literals (no `.vue` SFC files, no compile step).
- It is served as static files by the Express server itself at the `/native/` URL path.

**Purpose:**
- It is a **zero-setup frontend** for situations where you cannot or do not want to set up a Node build pipeline.
- It allows backend developers to test T4T and web components without needing to run a separate Vite dev server or build the `sample-vue-full` app.
- It demonstrates that the `bwc-*` web components (especially `bwc-t4t-form`) can be used in any plain HTML+JS environment, not just in Vue SFC projects.
- It is the second frontend implementation mentioned in the T4T README and by the manager ("also inside `apps/sample-api/public/vue-nobundler`").

**Why the manager said "not very good":**
- There is no TypeScript, no linting, no hot reload.
- The CSS framework is Bulma (loaded from CDN), which is different from the Ant Design Vue used in `sample-vue-full`.
- The components are less polished — `bwc-t4t-form.js` has multiple CSS frameworks (Bulma, Bootstrap, MUI) hardcoded as objects in the JS but not all of them are verified to work.
- Navigation and state management are minimal.

**It is not production code** — it is a development testbed for verifying T4T backend behavior with a browser.

---

## 14d. Understanding `.env.json`, Routing, and the DB Connection Model

### What is `.env.json`?

`apps/sample-api/.env.json` is the **application configuration file** loaded at server startup. It is read by the config loader in `common/compiled/node` and merged into `globalThis.__config`. It stores all non-secret configuration: service options, CORS rules, cookie settings, JWT settings, T4T settings, etc.

It is **not** an actual `.env` file (that is a different file, `.env`, which stores secret environment variables). The `.env.json` stores config shapes; actual secrets (connection strings, keys) come from environment variables.

The config loader in this project accepts `//` comments inside the JSON, which is why the file has inline comments even though standard JSON does not allow them.

### How DB connection config works — the two-file pattern

There are **two separate files** involved in every service connection:

| File | Contains | Example |
|---|---|---|
| `.env.json` | Config shape: client type, pool options, non-secret settings | `"DRIZZLE_PG": {}`, `"KNEXFILE_PG": { "client": "pg" }` |
| `.env` (gitignored) | Actual connection string (secret) | `DRIZZLE_PG=postgresql://user:pass@host:5432/db` |

This pattern is confirmed by reading the service constructors:

**StoreDrizzle** (`common/compiled/node/services/db/drizzle.ts`):
```ts
constructor(optionName?: string) {
  this._connectionString = process.env[optionName ?? ''] ?? null; // reads DRIZZLE_PG env var
  this._poolOptions = globalThis.__config?.[optionName] ?? {};    // reads .env.json object
}
```

**StoreKnex** (`common/compiled/node/services/db/knex.ts`):
```ts
constructor(optionName?: string) {
  const options = globalThis.__config?.[optionName] ?? {};  // reads .env.json object (client type etc.)
  options.connection = process.env[optionName ?? ''];       // ALWAYS overrides connection with env var
}
```

**Both use the same pattern**: the `optionName` (e.g. `DRIZZLE_PG` or `KNEXFILE_PG`) is used as both the `.env.json` key for config options AND the environment variable name for the connection string. The connection from `.env.json` is always overridden — it is just a placeholder or documentation hint.

**Consequence**: `"connection": ""` in `.env.json` is intentional. The actual connection string must be in the `.env` file as `KNEXFILE_PG=postgresql://...`.

### Is the T4T database the same as the dbdeploy database?

**Yes — they are the same database.** Here is why:

- `scripts/dbdeploy/db-sample/` runs **Knex migrations** (e.g. `20230827094948_initial.ts`) that create the T4T sample tables: `student`, `country`, `state`, `student_subject`, `award`, `users`.
- `scripts/dbdeploy/db-sample/` also runs **Drizzle migrations** (in `drizzle/` folder) that create the application tables used by the Drizzle-native generated routes.
- Both migration systems target **the same PostgreSQL database**, controlled by the `DATABASE_URL` environment variable.
- The sample-api's Drizzle (`drizzle1`) connects to this same database via the `DRIZZLE_PG` env var.
- T4T's Knex (`knex1`) connects to this same database via the `KNEXFILE_PG` env var.

**What identifies them as the same database?** The connection string. In dev, both `DRIZZLE_PG` and `KNEXFILE_PG` in `.env` point to the same PostgreSQL host/port/dbname. They just use different ORM libraries (`drizzle-orm` vs `knex`) to talk to it.

**Why two different ORMs for the same database?**
- Drizzle is the current standard in this codebase — type-safe, schema-driven.
- Knex was the original ORM. T4T was written with Knex and has never been ported.
- The Knex migrations in dbdeploy are legacy from when the whole app used Knex. They still exist because they created the original T4T sample tables. New tables are created via Drizzle migrations only.
- This is the Knex "legacy island" mentioned in the technical debt section (Section 12.2).

**To run T4T locally, you need to set in your `.env` file:**
```
DRIZZLE_PG=postgresql://postgres@127.0.0.1:55432/dev   # for Drizzle (sample-api, generate-crud routes)
KNEXFILE_PG=postgresql://postgres@127.0.0.1:55432/dev  # for T4T Knex — same connection string
```
(Port 55432 is the PGlite socket server started by `scripts/dbdeploy/serve-db.ts`.)

### How does routing work in sample-api?

**Confirmed from `apps/sample-api/src/routes/index.ts` and `src/app.ts`.**

The routing is entirely Express-based. Here is the flow from startup to a request hitting a handler:

```
node src/index.ts
  → imports src/app.ts
    → creates Express app
    → loads config from .env.json into globalThis.__config
    → starts all services (drizzle1, knex1, keyv, etc.)
    → calls routes/index.ts({ app })
      → app.use('/api/sample-api', ...)    ← mounts sample-api routes
      → t4tRoutes({ app, routePrefix: '/api/t4t' })  ← mounts T4T router
        → app.use('/api/t4t', t4t({ authFunc: mockAuthUser }))
          → inside t4t.ts: registers all T4T endpoints:
            GET  /api/t4t/config/:table
            GET  /api/t4t/find/:table
            ...
      → app.use('/api', authRoutes, oidcRoutes, ...)  ← mounts auth routes
```

Each "mount" point (`app.use('/prefix', router)`) means any request starting with that prefix is forwarded to that router. The T4T router internally registers sub-routes like `/config/:table`, `/find/:table`, etc., so the full URL becomes `/api/t4t/config/student`.

There is **no separate server** for T4T. It runs inside the same Express process as `sample-api`. The frontend calls `http://127.0.0.1:3000/api/t4t/...` and the same Express server that handles `/api/sample-api/...` also handles those.

### Why was Knex needed? Why wasn't it already there?

`better-sqlite3` (SQLite driver) is **not installed** in this project and the connection pattern would not work for object-shaped SQLite connections anyway. There was no `knex1` service configured in `sample-api` because the entire app had already migrated to Drizzle — the only remaining Knex usage is in T4T itself.

The `KNEXFILE_PG` entry was already in `.env.json` but had `knex1` commented out in `SERVICES_CONFIG`. Uncommenting it re-enables the Knex service, which T4T's `svc.get('knex1')` calls need to be able to get a non-null connection instance.

---

## 15. Correction: `conn: knex1` — What the Manager Actually Means

This directly answers question 5.

The line `conn: knex1` in every YAML file means: "use the database connection named `knex1` (a Knex connection) to run all queries for this table."

Your manager's statement "use the schema as single source of truth" is **not** about renaming `knex1` to something else. It is about a **deeper architectural change**:

Currently:
- The Drizzle schema defines the table structure for Drizzle-based code (the new `generate-crud` routes).
- The YAML re-defines the same table structure for T4T (name, columns, types, FKs).
- Both describe the same tables, separately, with no link between them.
- T4T uses Knex to query the database; `generate-crud` uses Drizzle.

What the manager wants:
- **Stop writing the column/type/FK sections of the YAML by hand.**
- Instead, read those from the Drizzle schema at startup (or at code generation time).
- T4T should then use **Drizzle** (not Knex) for its queries, just like `generate-crud` does.
- The YAML (or a replacement config format) would only contain the things that cannot be in the schema: permissions, UI labels, input types, filter flags, etc.

**In concrete terms:**

| What changes | Before | After (manager's vision) |
|---|---|---|
| Column names | Typed manually in YAML | Read from Drizzle schema |
| Column types | Typed manually in YAML | Derived from `col.getSQLType()` |
| Required | `required: true` in YAML | Derived from `col.notNull` |
| FK relations | 5-field `options:` block in YAML | Derived from `col.references()` |
| PK detection | `auto: pk` in YAML | Derived from `col.primaryKey` |
| DB queries | Knex (`svc.get('knex1')`) | Drizzle (`svc.get('drizzle1')`) |
| What stays in config | permissions, labels, UI tags, filter/sort/hide flags, deleteLimit | same |

The `generate-crud` generator already demonstrates reading Drizzle internals (`TABLE_COLUMNS`, `getSQLType()`, `notNull`, etc.). A future T4T could reuse this exact approach to populate its runtime table config from the schema instead of from YAML.

So to answer directly: **yes, the `generate-crud` approach can help T4T**, and `conn: knex1` would become `conn: drizzle1` (or be removed entirely if Drizzle is the only supported backend).

---

## 16. Improvement Directions

### Small Improvements (no architecture change)
- Cache YAML configs in memory at startup instead of reading disk on every request.
- Fix the `link` column display text bug in T4t.vue.
- Wire up the actual audit log INSERT in t4t-base.ts create/update/remove.
- Remove the dead `CUSTOM_PATH` commented code.

### Medium Refactors
- **Remove Knex from T4T**, port t4t-base.ts to use Drizzle. This closes the Knex legacy dependency and enables type-safe queries.
- **Add a metadata layer on top of Drizzle schema**: Instead of full YAML, write a smaller supplementary config that only defines the things that cannot be derived from the schema (permissions, UI labels, input types). The schema provides the rest.
- **Merge the two frontends**: Keep T4t.vue as the primary, make bwc-t4t-form.js a thin wrapper or deprecate it.

### Major Redesign
- **Schema-first generation**: Write a code generator (like the existing generate-crud.config.json and generate-crud.config.schema.json in the `scripts/` and `apps/sample-api/` folders) that reads Drizzle schema, auto-produces T4T configs, and only requires a supplementary file for permissions and UI-specific overrides.
- **OpenAPI output from T4T**: Since T4T already has a known, predictable API surface per table, it can auto-generate OpenAPI spec entries for each table's endpoints.
- **Permission system**: Replace the role string comparison with a proper RBAC or policy object that supports hierarchies and negation.

---

## 17. Suggested Learning Order for This Codebase

1. **Start with one YAML config**: Read tables/student.yaml. Understand every field.
2. **Read types.ts**: common/compiled/node/t4t/types.ts — understand `ColDef` and `TableDef`. This is what the YAML becomes after parsing.
3. **Read `generateTable` in t4t.ts**: Lines 68–127 of t4t.ts. This is the heart of the system — the middleware that turns a YAML file into a runtime config object.
4. **Read t4t-base.ts**: The `find` and `update` handlers are the most instructive. They show how `req.table` is used to build Knex queries and enforce permissions.
5. **Read t4t-utils.ts**: Focus on `roleOperationMatch`, `mapRelation`, and `kvDb2Col`.
6. **Read t4t-fe.js**: Understand the client-side API surface. Only 8 exported functions.
7. **Read T4t.vue**: The `onMounted` → `fetchData` → `formOpen` → `formSubmit` flow, in that order.
8. **Use t4t.http**: Send real requests against the running server to see request/response shapes.
9. **Read `custom/index.ts`**: Shows how to override the generic behavior per table.
10. **Read the state.yaml and student_subject.yaml**: See how a parent-child relationship is represented in config (linked via route navigation, not automatic join).
