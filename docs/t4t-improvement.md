# T4T Improvement Plan

This document outlines multiple approaches for improving the T4T system based on the manager's requirements. Choose one approach or combine elements from multiple approaches.

## Manager's Requirements (Summary)

- T4T should be a simple, universal editor — like the bot builder.
- **Schema as single source of truth**: stop re-declaring column names, types, and FK relations in YAML. Derive them from the Drizzle schema.
- **FK-derived relations**: if `student.countryId` references `country.id`, T4T should automatically understand the join and autocomplete without a manual 5-field `options:` block.
- **Parent-child navigation**: derive which tables have children from FK definitions.
- What the schema cannot provide (permissions, UI labels, input types, filter flags) stays in a supplementary config.
- The `bwc-t4t-form` web component and the Vue-bundled `T4t.vue` are both acceptable frontends; pick one or unify them.
- Remove Knex dependency — migrate to Drizzle like the rest of the codebase.

---

## Current State — What Exists

| Component | Status | Issue |
|---|---|---|
| `common/compiled/node/t4t/` | Working | Uses Knex, reads YAML on every request, no caching |
| YAML configs (per table) | Functional | Duplicates schema, verbose FK config, can drift |
| `T4t.vue` | Working | Good quality, Ant Design Vue |
| `bwc-t4t-form.js` | Working but weak | Multiple CSS frameworks hacked in, no real polish |
| `t4t-fe.js` | Working | Clean API surface |
| `generate-crud.ts` | Working | Drizzle-native, Zod-validated, schema-driven |
| sample-api T4T wiring | **Broken** | T4T router not mounted — returns 404 |

---

## Approach A — Minimal Fix (Low Risk, Low Effort)

**Goal**: Fix what is broken, keep the same architecture but clean it up.

### What to change

1. **Mount T4T in sample-api** — add to `src/routes/index.ts`:
   ```ts
   import t4tRoutes from '@common/node/t4t/index.ts';
   t4tRoutes({ app, routePrefix: '/api/t4t' });
   ```

2. **Port t4t-base.ts from Knex to Drizzle** — replace all `svc.get(table.conn)(table.name).where(...)` Knex calls with Drizzle equivalents. Use `drizzle1` as the connection name in YAML (`conn: drizzle1`).
   - `find`: `db.select().from(tableRef).where(...).limit(n).offset(m)`
   - `findOne`: `db.select().from(tableRef).where(eq(col, val)).limit(1)`
   - `create`: `db.insert(tableRef).values(body).returning()`
   - `update`: `db.update(tableRef).set(body).where(eq(pk, key)).returning()`
   - `remove`: `db.delete(tableRef).where(inArray(pk, keys))`
   - Joins for FK autocomplete: `db.select().from(A).leftJoin(B, eq(A.fkCol, B.pk))`

3. **Cache YAML configs at startup** — read all YAML files once when the router initializes instead of on every request. Invalidate cache only on hot reload.

4. **Fix the `link` column display bug in T4t.vue** — the expression result is currently discarded (line reads `table.config.cols[key].link?.text` without using the return value).

5. **Wire up audit logging** — complete the `setAuditData` calls in t4t-base.ts create/update/remove handlers.

6. **Remove dead code** — remove the commented-out `CUSTOM_PATH` dynamic import lines in t4t.ts.

### What stays the same
- Full YAML configs (column definitions stay in YAML)
- Frontend T4t.vue (no changes needed)
- Permission model (role string comparison)

### Effort: ~1–2 weeks
### Risk: Low — the Drizzle query API is well-understood in this codebase
### Outcome: Stable, working T4T on Drizzle, no more 404

---

## Approach B — Schema-Driven Supplement Config (Manager's Vision)

**Goal**: Drizzle schema is the single source of truth for structure. YAML shrinks to permissions + UI metadata only.

### Core Idea

At T4T startup, instead of reading a full YAML config, the system does two things:
1. **Introspects the Drizzle schema** (using the same `Symbol.for('drizzle:entityKind')` and `Symbol.for('drizzle:Columns')` trick that `generate-crud.ts` already uses) to extract column names, types, notNull, PK, and FK references.
2. **Reads a smaller supplement config file** (YAML or JSON) that only contains what the schema cannot provide: permissions, UI labels, input tags, filter flags, etc.

It then merges both into a complete `TableDef` object, which is returned by `/api/t4t/config/:table` exactly as today.

### What the Drizzle schema provides automatically

| TableDef/ColDef field | Derived how |
|---|---|
| `name` | `pgTable('student', ...)` first argument |
| `cols` (column names) | Object keys of the schema |
| `type` | `col.getSQLType()` → map to `string/integer/decimal/boolean/datetime/date/time` |
| `required` | `col.notNull === true` |
| `auto: pk` | `col.primaryKey === true` or `serial()` |
| `auto: ts` | `col.defaultFn` or `col.hasDefault` with `.defaultNow()` |
| FK relations (`options` block) | `col.references()` — FK target table and key are automatic |
| Composite PK (`multiKey`) | `primaryKey({ columns: [...] })` definitions |

### What stays in the supplement config

```yaml
# Only what cannot be derived from the schema
displayName: Students
view: admin,editor,viewer
create: admin
update: admin,editor
delete: admin
import: admin,editor
export: admin,editor
deleteLimit: 1
multiSelect: false
audit: true

cols:
  id:
    label: ID
    hide: true            # show nothing for this column in UI

  firstName:
    label: First Name
    ui:
      tag: input
      attrs: { type: text, maxlength: 20 }
    filter: true
    sort: true
    add: true
    edit: true
    creator: admin
    editor: admin

  countryId:
    label: Country
    ui:
      tag: autocomplete
      text: name          # which column in the related table to display — only this line is needed now
    filter: true
    sort: false
    add: true
    edit: true
    # foreignKey, tableName, key are derived automatically from Drizzle FK
```

**Compare to current YAML:** the current `countryId` block requires:
```yaml
options:
  foreignKey: countryId
  tableName: country
  key: id
  text: name
  column: name
  joinFromTable: student
```
After Approach B, only `text: name` needs to be provided in the supplement config. Everything else is derived.

### Parent-child table navigation

In the current system, "link" columns (child table navigation) are defined manually in YAML. With Approach B:
- At startup, T4T scans all Drizzle schema tables for FK references **back** to the current table.
- Example: `student_subject.studentId` references `student.id`. T4T automatically knows that `student` has a child table `student_subject`.
- A `childTables` array is auto-populated in the config response.
- The frontend can render "view related records" buttons from this without any YAML configuration.

### Implementation steps

1. **Write a schema introspector** (`t4t-schema.ts`) — similar to the `generate-crud.ts` reader, but returns `Partial<TableDef>` at runtime (not as a code generator). It imports the Drizzle schema and calls `getTableConfig(table)` or reads the Symbol fields.
2. **Write a merge function** — merges the introspected schema partial with the supplement YAML partial. Supplement config wins on conflicts (for labels, permissions, etc.).
3. **Rewrite t4t-base.ts queries** to use Drizzle (same as Approach A step 2). The table reference object from the Drizzle schema is passed through instead of a raw string table name.
4. **Shrink all YAML supplement files** — remove all fields that are now derived.
5. **Update the frontend** — `childTables` array enables automatic child navigation links.

### Effort: ~3–4 weeks
### Risk: Medium — the introspection approach is proven in generate-crud.ts but has never been used at runtime
### Outcome: Dramatically reduced config maintenance, schema drift becomes impossible for structural fields

---

## Approach C — generate-crud Integration (Generate T4T Supplement from Schema)

**Goal**: Use `generate-crud.ts` as the code generation layer. T4T only provides the frontend config server and the frontend component. The actual CRUD is handled by generated Drizzle routes.

### Core Idea

There are two sub-variants:

#### C1: generate-crud generates the supplement config (T4T handles CRUD)
- Extend `generate-crud.ts` to emit a third output file: `t4t-config/<table>.supplement.yaml` (the minimal supplement config from Approach B, auto-generated as a scaffold).
- The developer edits only the scaffolded supplement YAML (labels, permissions, UI tags).
- T4T reads the Drizzle schema + the supplement YAML at runtime — exactly like Approach B, but the supplement file is generated instead of hand-written.
- T4T still handles all CRUD via its generic Drizzle-ported handlers (t4t-base.ts).

**Added benefit**: Run `generate-crud` again after a migration and the supplement scaffold is re-generated. New columns appear automatically with sensible defaults. Deleted columns disappear. No schema drift possible.

#### C2: generate-crud handles CRUD, T4T only serves `/config` (No T4T generic CRUD)
- `generate-crud` continues to generate typed, Drizzle-native CRUD routes at `/api/<table>/*`.
- T4T is reduced to a single endpoint: `GET /api/t4t/config/:table` — it returns the UI config (merged schema introspection + supplement).
- The frontend (T4t.vue or bwc-t4t-form) is updated to point its data operations at `/api/<tableName>/` instead of `/api/t4t/<operation>/<tableName>`.
- T4T becomes a "frontend configuration server" only, not a CRUD backend.
- generate-crud-generated routes get filtering/sorting/pagination support added (currently missing from generated routes).

**Trade-off**: The generic filter/sort/pagination and CSV import/export that T4T provides today would need to be added to the generated controllers. This is significant work but produces better-typed, more maintainable code.

### Implementation steps for C1
1. Implement Approach B (schema introspector + supplement merge).
2. Add a new generator output to `generate-crud.ts`: emit `apps/sample-api/t4t-supplement/<table>.yaml` as a scaffold (created once, never overwritten — like sidecar controllers).
3. The scaffold contains all column names with `label`, `add`, `edit`, `filter`, `sort` defaulting to `false`/empty — developer fills in what they want.
4. Update `CONFIGS_FOLDER_PATH` (or rename to `SUPPLEMENT_PATH`) to point to the new supplement folder.

### Implementation steps for C2 (more invasive)
1. C1 steps 1–4.
2. Generate-crud adds filter/sort/pagination/CSV to generated controllers (substantial generator change).
3. T4T CRUD handlers (t4t-base.ts) are deprecated — only `/config` endpoint remains.
4. Frontend `t4t-fe.js` is updated to call `GET /api/<table>?page=1&limit=10` instead of `GET /api/t4t/find/<table>`.
5. Permission checks move from YAML into auth middleware per generated route.

### Effort: C1 ~4–5 weeks, C2 ~8–10 weeks
### Risk: C1 Medium, C2 High
### Outcome: C1 is Approach B with auto-scaffolding. C2 is a full architecture replacement.

---

## Comparison Matrix

| Criterion | A (Minimal) | B (Schema-Driven) | C1 (generate-crud scaffold) | C2 (T4T config-only) |
|---|---|---|---|---|
| Effort | Low | High | Very High | Extreme |
| Risk | Low | Medium | Medium | High |
| Removes Knex | Yes | Yes | Yes | Yes |
| Removes YAML drift | No | Yes | Yes | Yes |
| Auto FK relations | No | Yes | Yes | Yes |
| Auto child tables | No | Yes | Yes | Yes |
| CSV import/export | Kept | Kept | Kept | Must re-implement |
| File upload | Kept | Kept | Kept | Must re-implement |
| Frontend changes | Minimal | Minor | Minor | Significant |
| Permission model | Same | Same | Same | Moves to middleware |
| Config file size | Same | Much smaller | Auto-generated | Much smaller |
| Schema drift risk | Same | Eliminated | Eliminated | Eliminated |
| Recommended for | Quick win | Phase 2 | Phase 3 | Future vision |

---

## Recommended Phased Path

### Phase 1 (Immediate) — Approach A
Fix the 404, port Knex → Drizzle, cache YAML, fix small bugs. T4T becomes stable and usable.

### Phase 2 (Next sprint) — Approach B
Implement schema introspector. Shrink YAML supplement files. Auto-derive FK relations and child tables.

### Phase 3 (Future) — Approach C1
Extend generate-crud to scaffold supplement configs. New tables get T4T configs for free after running the generator.

### Phase 4 (Long term) — Approach C2 (optional)
Evaluate whether the T4T generic CRUD handlers are worth keeping or whether generate-crud routes should fully replace them. Only consider if T4T becomes a source of maintenance problems.

---

## What Stays the Same in All Approaches

- `/api/t4t/config/:table` endpoint exists — the frontend always reads it.
- `T4t.vue` is the primary frontend — no major rewrites needed.
- The permission model (role-based, per-table, per-field) is preserved in all approaches.
- File upload (`ui.tag: files` + multer) is preserved.
- CSV import/export is preserved (except in C2).
- The `custom/` override system is preserved (allows per-table overrides).

---

## Open Questions for Manager

1. Should `generate-crud` and T4T eventually share the same CRUD handlers, or remain separate systems that solve different problems?
2. For the `autocomplete`/FK display text (e.g., `name` in the `country` table): should this be declared in the Drizzle schema (e.g., a special `displayColumn` annotation), or always declared in the supplement config?
3. Should T4T permissions eventually move to the FGA (OpenFGA) system already in the codebase, replacing the simple role-string comparison?
4. Is the `bwc-t4t-form` web component worth maintaining alongside T4t.vue, or should it be deprecated in favour of T4t.vue only?
