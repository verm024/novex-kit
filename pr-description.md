# PR Title
`chore(sample-api): refactor src to resource-based folder structure`

---

## Pull Request Checklist

- [ ] I read and followed the [Contribution guide](https://github.com/ais-one/novex-kit/blob/main/.github/CONTRIBUTING.md)
- [ ] I linked the related issue, if one exists
- [ ] I ran the relevant checks or tests for the affected area

## Summary

Restructures `apps/sample-api/src/` from a flat MVC layout (routes and controllers
in separate top-level folders) to a **resource-based layout** where every feature owns
its own folder containing all its files.

### Layout options considered

All the layouts below are widely used in modern frameworks:
- **MVC split**: Django, traditional Express apps
- **Domain-based**: Spring Boot (modules), some large monoliths
- **Resource/table-based**: NestJS, FastAPI

We compared these three to find the best fit for this codebase and its code generator.

**First, a note on terminology**: A **resource** is one database table (users, companies, categories). A **feature** can be large and span multiple resources (e.g., a "dashboard" feature queries users + companies + analytics).

#### 1) MVC split (by technical layer)

Put all routes in one folder, all controllers in another, all schemas in a third.

```text
src/
  routes/
    users.ts
    roles.ts
  controllers/
    users.ts
    roles.ts
  schemas/
    users.schema.js
    roles.schema.js
```

**Pros:**
- Familiar to developers who've used Django, Rails, or traditional Express apps
- Clear separation of concerns by file type

**Cons:**
- When you need to change a resource (e.g., `users`), you jump between three folders
- The generator outputs one set of files per resource, so you have to place them in three different locations
- As the app grows, finding all related files for one resource takes more effort

**Note:** The generator in this PR was changed from MVC output (routes/, controllers/, schemas/) to resource-based output. Supporting both would require conditional logic in the generator.

#### 2) Domain-based (by business domain)

Group related resources into domain folders. For example, put `users`, `roles`, `permissions` together under `iam/` because they're all identity-related.

```text
src/
  iam/
    users/
      routes.ts
      controller.ts
      schema.js
    roles/
      routes.ts
      controller.ts
      schema.js
  catalog/
    categories/
      routes.ts
      controller.ts
      schema.js
```

**Pros:**
- Aligns with how your business thinks about features (domains)
- Easy to extract a domain as a separate service later

**Cons:**
- Someone has to manually decide which domain each resource (table) belongs to
- The generator can't know that `users` belongs to `iam/` unless you configure it per table in a config file
- Adding config for every table is tedious and error-prone
- It defeats the purpose of automatic CRUD generation — the generator becomes semi-automatic
- If the domain boundaries change later, you have to manually move folders and update the config
- The generator needs modification to read domain config and place files accordingly

#### 3) Resource/table-based (one folder per database table)

Each table gets its own folder with all its files.

```text
src/
  users/
    routes.ts
    controller.ts
    schema.js
    generated/
      routes.ts
      controller.ts
      schema.js
  roles/
    routes.ts
    controller.ts
    schema.js
    generated/
      routes.ts
      controller.ts
      schema.js
```

**Pros:**
- When the generator runs, it knows exactly where to put files — one folder per table
- All files for one resource are in one place — one folder = one resource/table
- Fast to navigate and understand — no jumping between multiple directories
- **This is what the generator was designed for** — the generator creates files for each table, so this layout matches perfectly
- Easy to add endpoints to a resource without touching other resources

**Cons:**
- Shared logic (like auth middleware) must be extracted to a common folder
- Cross-resource features (like analytics queries spanning multiple tables) need to live in a separate shared folder (see "Handling cross-resource features" below)

### Comparison

| Aspect | MVC | Domain | Resource |
|--------|-----|--------|----------|
| **Generator-friendly** | ⚠️ Changed in this PR | ❌ Needs config per table | ✅ Implemented |
| **Resource colocation** | ❌ Spread across 3 places | ✅ In domain folder | ✅ One folder |
| **Navigation speed** | ❌ Jump between 3 folders | ✅ One domain folder | ✅ One folder |
| **Setup complexity** | ✅ None | ❌ Config per table | ✅ None |
| **Risk of human error** | ✅ Low | ❌ High (domain decisions) | ✅ Low |
| **Configuration overhead** | ✅ None | ❌ Domain config per table | ✅ None |

### Decision: resource/table-based for generated resources, developer-flexible for custom code

**Resource/table-based** was selected for **generated CRUD files** because it is a perfect fit for automatic code generation.

1. **The generator creates one set of files per table** — resource-based is the natural home for those files (no config needed)
2. **No manual configuration** — unlike domain-based, you don't need to tell the generator which domain each table belongs to
3. **All generated resource files in one place** — no jumping between routes/, controllers/, and schemas/ folders
4. **Matches modern practice** — NestJS (the most popular Node.js framework) uses exactly this layout; Spring Boot (Java) and FastAPI (Python) also use resource-based grouping
5. **Simpler generator logic** — the generator only needs to know the table name, not complex domain rules

**However, developers are free to organize hand-written custom code however they want.** If you need domain-based features (like `analytics/`, `reporting/`, `queries/`), just create them at the `src/` level alongside the generated resource folders. The structure is naturally hybrid:
- **Generated**: resource-based (one folder per table)
- **Custom**: developer-organized (domain-based, feature-based, whatever makes sense)

The team also adjusted the generator to create a default sidecar `routes.ts` that wraps the generated routes, making it trivial to add custom endpoints or override validation without touching generated files.

### Handling cross-resource and custom features

**Key insight**: The generated resources use resource-based structure, but you can add custom folders for hand-written features.

Custom folders are flexible in naming (`analytics/`, `queries/`, `reporting/`), but they should still follow the same conventions used elsewhere:
- `routes.ts` for endpoint registration
- `controller.ts` (or `service.ts`) for handler/business logic
- `schema.js` for request/response validation when needed
- `queries.ts` (or repository files) for SQL-heavy cross-resource queries

For complex queries that span multiple resources (analytics, dashboards, reports), developers can create domain-based custom folders:

```text
src/
  users/                 ← generated CRUD for users table
    routes.ts
    controller.ts
    schema.js
    generated/
      routes.ts
      controller.ts
      schema.js
  companies/             ← generated CRUD for companies table
    routes.ts
    controller.ts
    schema.js
    generated/
      routes.ts
      controller.ts
      schema.js
  analytics/             ← custom hand-written domain (not generated)
    routes.ts
    controller.ts
    schema.js
    queries.ts
  queries/               ← or any custom folder name
    routes.ts
    controller.ts
    queries.ts
  ...
```

Examples:
- `GET /users` → lives in `src/users/` (generated) ✅
- `GET /companies/:id/users` → lives in `src/users/` (generated, it's user-related) ✅
- `GET /analytics/active-users-per-day` → lives in `src/analytics/` (hand-written, developer-organized) ✅
- `GET /reports/user-engagement-by-company` → lives in `src/queries/` (hand-written, spans users + companies + engagement data) ✅

This hybrid approach gives you **generator simplicity for CRUD** + **developer flexibility for complex custom features**, while keeping a consistent route/controller/schema shape across the codebase.

### AI summary and chat-link note

AI-assisted analysis compared MVC, domain-based, and resource-based layouts with examples, pros, cons, and patterns for cross-resource features. Resource-based was confirmed as the best fit for **generated CRUD resources** because it aligns perfectly with how the generator works and avoids manual configuration burden of domain-based designs. The analysis also clarified that the structure is naturally hybrid: **generated files use resource-based organization, while developers can create custom domain-based folders (analytics/, queries/, etc.) for hand-written complex features.**

A direct shareable link to the Copilot chat is not available, so this PR includes the full decision summary and comparison inline for reviewer visibility.

### What changed

**`src/` folder structure — before vs after**

```
Before                              After
──────────────────────────────────  ──────────────────────────────────
src/
  controllers/
    users.ts                        src/
    roles.ts                          users/
    permissions.ts                      controller.ts       ← sidecar
  routes/                               schema.js           ← sidecar
    users.ts                            routes.ts           ← sidecar
    roles.ts                            generated/
    permissions.ts                        controller.ts
    categories.ts                         routes.ts
    auth.ts                               schema.js
    ...                               roles/  (same)
    index.ts                          permissions/  (same)
  schemas/                            categories/  (same)
    users.schema.js                   auth/
    roles.schema.js                     routes.ts
    categories.schema.js              base/ sse/ tests/ ...
```

**`src/routes/index.ts` → `src/router.ts`**

The route registration hub is now a single file at the `src/` root (`src/router.ts`),
not buried inside a `routes/` folder. It is not a feature — it is the app's entry
point for routing — so it lives at the same level as `app.ts`.

**Schema colocation — `schemas/` → `src/<resource>/schema.js`**

Previously, Zod schemas lived in a top-level `schemas/` directory separate from the
resource that uses them. They are now colocated inside each resource folder. The
reasoning mirrors NestJS DTOs: a DTO (or schema) is not a shared artifact — it is
a direct description of the input/output contract for a specific resource, so it
belongs next to that resource's controller and routes.

One counter-argument considered was that schemas are "artifacts not source", but the
`src/` folder already contains generated files (under `*/generated/`), so the
distinction does not hold in practice. The `generate-openapi.ts` scanner was updated
to look for `src/<table>/schema.js` instead of `schemas/*.schema.js`.

**Sidecar routes pattern**

Each resource gets a sidecar `routes.ts` (created once by the generator, then owned by
the developer). By default it wraps the generated router:

```ts
export default express
  .Router()
  // add custom endpoints or override route schemas before .use():
  .use('/', generatedRoutes);
```

Adding a new endpoint or swapping a route's validation schema only requires inserting
one line before `.use('/', generatedRoutes)`. Handler-only overrides (changing what a
generated endpoint returns without touching validation) only require a change to
`controller.ts` — the generated routes already import from the sidecar controller.

**Files migrated as-is**

All hand-written custom endpoint folders (`auth`, `base`, `fido`, `sse`, `tests`, `webhooks`,
`webpush`) and their controllers/schemas were moved to the new resource-based layout with
no functional changes.

**Categories as a committed CRUD sample**

The `categories` table is kept as a tracked example of the full generated output — it
ships with `generated/schema.js`, `generated/routes.ts`, `generated/controller.ts`, a
sidecar `controller.ts`, `schema.js`, and `routes.ts`, plus a unit test — so reviewers
and new contributors can see what a fully generated resource looks like without running
the generator.

**Generator tutorial added to `scripts/generators/README.md`**

`scripts/generators/README.md` (new file) documents the full customisation workflow:
- All six files the generator produces per table and who owns each
- How to override an existing CRUD handler (controller only)
- How to add a new endpoint (before `.use('/', generatedRoutes)`)
- How to add a new schema (Case A: `export *` + new name)
- How to override an existing generated schema (Case B: selective re-exports to avoid
  duplicate export errors)
- How the OpenAPI generator picks up sidecar schemas automatically

## Affected Area

- [x] apps
- [ ] common
- [ ] docs
- [x] scripts
- [ ] CI/CD or GitHub Actions

## Validation

```text
npm run generate:crud     # regenerated all tables — output matches new structure
npm run test:schema       # schema exports validated
```

Unit test for the categories controller passes against the new sidecar path.

## Notes

The `.gitignore` in `sample-api` now ignores `src/*/generated/*`, `src/*/schema.js`,
`src/*/controller.ts`, and `src/*/routes.ts` by default, with explicit exceptions for
the IAM tables (users/roles/permissions), categories (committed sample), and the
hand-written feature routes. This keeps generated noise out of git while keeping the
illustrative examples tracked.
