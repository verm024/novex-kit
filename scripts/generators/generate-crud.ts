#!/usr/bin/env node
// scripts/generators/generate-crud.ts
//
// Generates Zod schemas, Express routes, and controllers from a Drizzle schema.
// Files inside generated/ directories are always overwritten on each run.
// Sidecar files outside generated/ are created once and then owned by the developer.
//
// Usage (run from the target app directory):
//   node ../../scripts/generators/generate-crud.ts \
//     --schema   ./src/database/schema.ts \
//     --app      . \
//     --db       drizzle1 \
//     [--tables  categories,student] \
//     [--route-prefix /api/sample-api]
//
//   --schema-module is optional. When omitted, the relative .ts import path is
//   computed automatically from --schema relative to the generated controller location.
//
// Output layout (relative to --app):
//   src/<table>/generated/schema.js      ← ALWAYS overwritten (Zod schemas)
//   src/<table>/generated/routes.ts      ← ALWAYS overwritten (Express routes)
//   src/<table>/generated/controller.ts  ← ALWAYS overwritten (CRUD handlers)
//   src/<table>/schema.js                ← created ONCE  (your sidecar)
//   src/<table>/controller.ts            ← created ONCE  (your sidecar)
//   src/<table>/routes.ts                ← created ONCE  (your sidecar)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

/**
 * Parses a flat `--key value` argument list into a plain object.
 * Consecutive `--key` tokens consume the immediately following token as their value.
 * Unknown or boolean-style flags (no following value) are stored as empty strings.
 *
 * @param argv - The argument list to parse, typically `process.argv.slice(2)`.
 * @returns A map of flag name (without the `--` prefix) to its string value.
 */
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      result[arg.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const schemaFilePath = args.schema;
const appDir = args.app;
const dbName = args.db;
const tablesFilter = args.tables ? args.tables.split(',').map(s => s.trim()) : null;
const routePrefix = args['route-prefix'] ?? '';

if (!schemaFilePath || !appDir || !dbName) {
  console.error(`
Usage: node scripts/generators/generate-crud.ts \\
  --schema         <path>    Path to Drizzle schema .ts file (relative to cwd)
  --app            <dir>     App root directory (relative to cwd)
  --db             <name>    Drizzle service name passed to services.get()
  [--schema-module <spec>]   Override the import path embedded in generated controllers
                             (auto-computed from --schema when omitted)
  [--tables        <t1,t2>]  Comma-separated table variable names to process
  [--route-prefix  <prefix>] URL prefix printed in mount hint (e.g. /api/sample-api)
`);
  process.exit(1);
}

import { getColumns, isPgTable } from '../../common/compiled/node/services/db/introspect.ts';

// ─── SQL type → Zod code mapping ─────────────────────────────────────────────

/**
 * Maps a Drizzle / PostgreSQL SQL type string to the corresponding Zod v4 schema code snippet.
 *
 * The returned string is embedded verbatim into generated schema files, so it must be
 * valid JavaScript/TypeScript using the `z` import already present in those files.
 *
 * Handling notes:
 * - `serial` / `bigserial` are mapped to `z.number().int().positive()` because Drizzle
 *   exposes them as plain `integer` at the JS layer but the PK is always > 0.
 * - `numeric` / `decimal` are mapped to `z.string()` because drizzle-orm returns these
 *   as strings to avoid floating-point precision loss.
 * - `inet` and `text[]` are custom column types; they resolve to `string` and
 *   `string[]` respectively based on how they are handled in this codebase.
 * - Unknown types fall back to `z.unknown()` so the file still compiles.
 *
 * @param sqlType - The raw SQL type string as returned by `col.getSQLType()` (e.g. `'varchar(255)'`, `'integer'`).
 * @returns A Zod schema code snippet string (e.g. `'z.string()'`, `'z.number().int()'`).
 */
function sqlTypeToZodCode(sqlType: string): string {
  const base = sqlType.toLowerCase().split('(')[0].split(' ')[0].trim();
  switch (base) {
    case 'serial':
    case 'bigserial':
      return 'z.number().int().positive()';
    case 'integer':
    case 'int':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'bigint':
      return 'z.number().int()';
    case 'varchar':
    case 'character':
    case 'char':
    case 'text':
      return 'z.string()';
    case 'boolean':
    case 'bool':
      return 'z.boolean()';
    case 'numeric':
    case 'decimal':
      return 'z.string()'; // drizzle-orm returns numeric as string
    case 'timestamp':
    case 'date':
    case 'time':
      return 'z.string()';
    case 'jsonb':
    case 'json':
      return 'z.unknown()'; // json columns may hold any shape (object or array)
    case 'uuid':
      return 'z.string().uuid()';
    case 'inet':
      return 'z.string()'; // custom inet type — underlying data is string
    case 'text[]':
      return 'z.array(z.string())'; // custom textArray type — underlying data is string[]
    default:
      return 'z.unknown()';
  }
}

// ─── Naming helpers ───────────────────────────────────────────────────────────

/**
 * Uppercases the first character of a string.
 * Used to convert a camelCase Drizzle table variable name (e.g. `'categories'`)
 * into the PascalCase prefix used for generated schema and controller exports
 * (e.g. `'Categories'`).
 *
 * @param str - The string to convert.
 * @returns The input string with its first character uppercased.
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a camelCase or PascalCase identifier to kebab-case.
 * Used to produce the file name stem for generated files.
 *
 * @example `'fgaConfig'` → `'fga-config'`, `'auditLog'` → `'audit-log'`
 *
 * @param str - The camelCase or PascalCase identifier to convert.
 * @returns The kebab-case equivalent.
 */
function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^-/, '');
}

// ─── File helpers ─────────────────────────────────────────────────────────────

/**
 * Writes `content` to `filePath`, creating any intermediate directories as needed.
 * Always overwrites the file if it already exists.
 *
 * @param filePath - Absolute path of the file to write.
 * @param content  - UTF-8 string content to write.
 */
function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Writes `content` to `filePath` only when the file does not already exist.
 * Used for sidecar files that are created once and then owned by the developer.
 *
 * @param filePath - Absolute path of the file to create.
 * @param content  - UTF-8 string content to write.
 * @returns `true` if the file was created, `false` if it already existed.
 */
function writeIfAbsent(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  writeFile(filePath, content);
  return true;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Shape of the optional `generate-crud.config.json` file placed at the app root.
 *
 * The config file lets you control table-level and field-level generation behaviour
 * without modifying the generator script itself. Place it alongside `package.json`
 * and point VS Code IntelliSense at the companion JSON Schema via `"$schema"`:
 *
 * ```json
 * {
 *   "$schema": "../../scripts/generators/generate-crud.config.schema.json"
 * }
 * ```
 */
interface CrudConfig {
  /** Tables to skip entirely — no Zod schema, no routes, no controllers generated. */
  exclude?: string[];
  /**
   * Tables to generate a Zod schema for, but NOT routes or controllers.
   * Useful for documenting table shapes in OpenAPI without exposing public CRUD endpoints.
   */
  schemaOnly?: string[];
  /** Per-table field-level exclusions, keyed by Drizzle table variable name. */
  tables?: Record<
    string,
    {
      /**
       * Column names to remove from BodySchema and UpdateSchema.
       * Use for server-managed fields that clients must never supply directly
       * (e.g. password hashes, OTP pins, security counters).
       */
      excludeFromBody?: string[];
      /**
       * Column names to omit from SELECT in generated controllers.
       * Produces an explicit column list so sensitive data is never returned
       * in API responses (e.g. password, salt, gaKey).
       */
      excludeFromResponse?: string[];
    }
  >;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Describes a single field in the generated `BodySchema` (POST) and `UpdateSchema` (PATCH).
 * Fields excluded via `excludeFromBody` config or those that are primary-key / SQL-expression
 * columns are never represented here.
 */
interface BodyField {
  /** Column name as it appears in the Drizzle schema. */
  name: string;
  /** Zod schema code snippet for this field (e.g. `'z.string()'`). */
  zodCode: string;
  /**
   * Whether the field is required in the body schema.
   * `true` when the column is `NOT NULL` and has no default value;
   * `false` when the column is nullable or has a default (optional in POST body).
   */
  required: boolean;
  /** Raw SQL type (e.g. 'timestamp', 'varchar', 'integer') for type-aware preprocess. */
  sqlType: string;
}

/**
 * Metadata for a single column included in the generated `ResponseSchema`.
 * Used to build the Zod schema that describes what the API returns on GET requests.
 */
interface ResponseField {
  /** Column name as it appears in the Drizzle schema. */
  name: string;
  /** Zod schema code snippet for this field (e.g. `'z.string()'`). */
  zodCode: string;
  /** `true` if the column is nullable — appends `.nullable()` in the generated schema. */
  nullable: boolean;
}

interface FkJoinInfo {
  colName: string;
  refVar: string;
  refPkCol: string;
  refTextCol: string;
}

/**
 * Aggregates all per-table metadata needed by the code generators.
 * Constructed once per table in the main loop and passed to every `generate*` function.
 */
interface TableInfo {
  /** Drizzle export variable name (camelCase), e.g. `'categories'`, `'fgaConfig'`. */
  varName: string;
  /** PascalCase prefix used for generated export names, e.g. `'Categories'`. */
  pascalName: string;
  /** Kebab-case stem used for file names and URL segments, e.g. `'fga-config'`. */
  kebabName: string;
  /** Name of the primary key column, e.g. `'id'` or `'code'`. For composite PK this is `'__key'`. */
  pkColName: string;
  /** All PK column names — length 1 for single PK, >1 for composite PK. */
  pkColNames: string[];
  /** `true` when the table has multiple PK columns (composite primary key). */
  isCompositePk: boolean;
  /**
   * `true` when the primary key is a numeric type (`serial`, `integer`, etc.).
   * Controls whether generated param schemas use `z.coerce.number()` or `z.string()`.
   */
  pkIsNumeric: boolean;
  /** Ordered list of fields included in the generated `BodySchema` and `UpdateSchema`. */
  bodyFields: BodyField[];
  /**
   * All columns except those in `excludeFromResponse`, used to build the generated
   * `ResponseSchema` and for explicit SELECT column lists in controllers.
   * Carries nullable information so the schema accurately reflects DB constraints.
   */
  responseFields: ResponseField[];
  /**
   * All column names for this table.
   * Used to build an explicit SELECT column list when `excludeFromResponse` is non-empty,
   * ensuring sensitive columns are never returned in API responses.
   */
  allColNames: string[];
  /**
   * Column names to omit from SELECT queries in generated controllers.
   * When non-empty, the controller uses an explicit column list instead of `SELECT *`.
   * Sourced from `generate-crud.config.json → tables.<name>.excludeFromResponse`.
   */
  excludeFromResponse: string[];
  /** FK join metadata derived from schema FK constraints + supplement options.text. */
  fkJoins: FkJoinInfo[];
}

// ─── Code generators ─────────────────────────────────────────────────────────

/**
 * Returns the standard auto-generated file header comment.
 * Placed at the top of every file inside `generated/` to discourage manual edits
 * and to identify the source Drizzle table.
 *
 * @param varName - The Drizzle table variable name used as the source label.
 */
const AUTO_HEADER = (varName: string) => `\
// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run \`npm run generate:crud\` to regenerate this file.
// Source table: ${varName}
// ─────────────────────────────────────────────────────────────────────────────
`;

/**
 * Generates the content of a `schemas/generated/<table>.schema.js` file.
 *
 * The file exports four Zod schemas registered with `.meta({ id })` so that
 * `generate-openapi.ts` can reference them as named OpenAPI components:
 * - `${Pascal}BodySchema`     — fields accepted on `POST /<table>` (excludes PK, SQL-expression defaults, and `excludeFromBody` columns)
 * - `${Pascal}UpdateSchema`   — same fields but all optional (for `PATCH`)
 * - `${Pascal}ParamsSchema`   — single-field object holding the primary key (for URL params)
 * - `${Pascal}QuerySchema`    — pagination params (`limit` and `page`) for `GET /<table>`
 * - `${Pascal}ResponseSchema` — all columns minus `excludeFromResponse`, used as the GET response body in OpenAPI
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateSchemaFile(info: TableInfo): string {
  const {
    varName,
    pascalName,
    kebabName,
    pkColName,
    pkIsNumeric,
    pkColNames,
    isCompositePk,
    bodyFields,
    responseFields,
  } = info;

  const pkZodCode = pkIsNumeric ? 'z.coerce.number().int().positive()' : 'z.string().min(1)';
  const pkExample = pkIsNumeric ? '1' : "'example-id'";

  // Frontend sends empty string for unfilled numeric/date/time fields;
  // preprocess converts '' to undefined so Zod never sees it and the field
  // either becomes optional (omitted from body) or fails required validation.
  const preprocessable = (code: string, type: string): string | null => {
    const baseType = type.toLowerCase().split('(')[0].split(' ')[0].trim();
    if (code.startsWith('z.number()')) return 'Number(v)';
    if (['timestamp', 'date', 'time'].includes(baseType)) return 'v';
    return null;
  };
  const bodyLines = bodyFields
    .map(f => {
      // optional fields also accept null (frontend sends null for untouched form fields)
      const innerCode = f.required ? f.zodCode : `${f.zodCode}.nullish()`;
      const transform = preprocessable(f.zodCode, f.sqlType);
      if (transform) {
        return `    ${f.name}: z.preprocess(v => v === '' ? undefined : ${transform}, ${innerCode}),`;
      }
      return `    ${f.name}: ${innerCode},`;
    })
    .join('\n');
  const responseLines = responseFields
    .map(f => `    ${f.name}: ${f.zodCode}${f.nullable ? '.nullable()' : ''},`)
    .join('\n');

  return `${AUTO_HEADER(varName)}import { z } from 'zod';

// Insert body — fields accepted on POST /${kebabName}
export const ${pascalName}BodySchema = z
  .object({
${bodyLines}
  })
  .meta({ id: '${pascalName}Body' });

// Partial update — all fields optional for PATCH /${kebabName}/:${pkColName}
export const ${pascalName}UpdateSchema = ${pascalName}BodySchema.partial().meta({ id: '${pascalName}Update' });

// URL params — :${pkColName} on /:${pkColName} routes
export const ${pascalName}ParamsSchema = z
  .object({
    ${isCompositePk ? `__key: z.string().min(1).meta({ example: '${pkColNames.join('|')}' })` : `${pkColName}: ${pkZodCode}.meta({ example: ${pkExample} })`},
  })
  .meta({ id: '${pascalName}Params' });

// Query params — pagination for GET /${kebabName}
export const ${pascalName}QuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(25).meta({ example: 25 }),
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  })
  .passthrough()
  .meta({ id: '${pascalName}Query' });

// Full row as returned by SELECT — columns in excludeFromResponse are omitted
export const ${pascalName}ResponseSchema = z
  .object({
${responseLines}
  })
  .meta({ id: '${pascalName}Response' });
`;
}

/**
 * Generates the content of a `src/routes/generated/<table>.ts` file.
 *
 * The file exports a single Express `Router` that wires up the five standard CRUD
 * operations, each protected by `authUser` middleware and validated against the
 * corresponding generated Zod schema:
 * - `POST   /`         — create
 * - `GET    /`         — list (paginated)
 * - `GET    /:pk`      — find one
 * - `PATCH  /:pk`      — partial update
 * - `DELETE /:pk`      — remove
 *
 * The route delegates all business logic to the sidecar controller
 * (`src/controllers/<table>.ts`) so developer overrides are picked up automatically.
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateRouteFile(info: TableInfo): string {
  const { varName, pascalName, kebabName, pkColName, isCompositePk } = info;
  const routePkParam = isCompositePk ? '__key' : pkColName;

  return `${AUTO_HEADER(varName)}import { authUser as realAuth } from '@common/node/auth/jwt';
import { requireRole } from '@common/node/auth/permit';

// biome-ignore lint/suspicious/noExplicitAny: mock auth for development (same as T4T's index.ts)
const authUser = process.env.NODE_ENV === 'production' ? realAuth : (req: any, _res: any, next: any) => {
  req.user = { sub: 'testuser', roles: ['admin', 'editor', 'viewer'] };
  next();
};
import { validate } from '@common/node/errors/validate';
import express from 'express';
import { memoryUpload } from '@common/node/express/upload';
import supplement from '../t4t-supplement.ts';
import {
  ${pascalName}BodySchema,
  ${pascalName}ParamsSchema,
  ${pascalName}QuerySchema,
  ${pascalName}UpdateSchema,
} from './schema.js';
// Imports from the sidecar controller so developer overrides are picked up automatically.
import ${varName}Controller from '../controller.ts';

export default express
  .Router()
  .get('/config', authUser, ${varName}Controller.getConfig)
  .post('/delete', authUser, requireRole(supplement, 'delete'), ${varName}Controller.removeBatch)
  .post('/upload', authUser, requireRole(supplement, 'import'), memoryUpload().single('file'), ${varName}Controller.upload)
  .post('/autocomplete', authUser, requireRole(supplement, 'view'), ${varName}Controller.autocomplete)
  .post('/', authUser, requireRole(supplement, 'create'), validate('body', ${pascalName}BodySchema), ${varName}Controller.create)
  .get('/', authUser, requireRole(supplement, 'view'), validate('query', ${pascalName}QuerySchema), ${varName}Controller.find)
  .get('/:${routePkParam}', authUser, requireRole(supplement, 'view'), validate('params', ${pascalName}ParamsSchema), ${varName}Controller.findOne)
  .patch(
    '/:${routePkParam}',
    authUser,
    requireRole(supplement, 'update'),
    validate('params', ${pascalName}ParamsSchema),
    validate('body', ${pascalName}UpdateSchema),
    ${varName}Controller.update,
  )
  .delete('/:${routePkParam}', authUser, requireRole(supplement, 'delete'), validate('params', ${pascalName}ParamsSchema), ${varName}Controller.remove);
`;
}

/**
 * Generates the content of a `src/controllers/generated/<table>.ts` file.
 *
 * The file exports five async Express handler functions (`create`, `find`, `findOne`,
 * `update`, `remove`) that implement standard CRUD operations using Drizzle ORM.
 *
 * When `excludeFromResponse` is non-empty, the generated `select()` call uses an
 * explicit column map instead of `SELECT *`, ensuring that sensitive fields (e.g.
 * `password`, `salt`) are never returned in list or detail responses.
 *
 * The file also exports `_injectServices` so unit tests can substitute a mock
 * without needing ESM module mocking.
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateControllerFile(info: TableInfo): string {
  const { varName, pkColName, pkIsNumeric, pkColNames, isCompositePk, allColNames, excludeFromResponse, fkJoins } =
    info;

  // Build PK where expression and returning object depending on single vs composite PK
  let pkWhereExpr = '';
  let pkReturningObj = '';
  let pkSplitPrologue = '';
  if (isCompositePk) {
    const eqs = pkColNames.map((name, i) => `eq(table.${name}, parts[${i}])`).join(', ');
    pkWhereExpr = `and(${eqs})`;
    pkSplitPrologue = "  const parts = req.params.__key.split('|');\n";
    const retFields = pkColNames.map(name => `  ${name}: table.${name}`).join(',\n');
    pkReturningObj = `{\n${retFields}\n}`;
  } else {
    const pkExpr = pkIsNumeric ? `Number(req.params.${pkColName})` : `req.params.${pkColName}`;
    pkWhereExpr = `eq(table.${pkColName}, ${pkExpr})`;
    pkReturningObj = `{ ${pkColName}: table.${pkColName} }`;
  }

  // Build explicit column select when sensitive fields must be excluded from responses
  const safeColNames = allColNames.filter(c => !excludeFromResponse.includes(c));
  const hasExclusions = excludeFromResponse.length > 0;
  const selectArgLines = safeColNames.map(c => `      ${c}: table.${c},`).join('\n');

  // Build FK_CONFIG array — static metadata consumed by join-utils at runtime
  const fkConfigCode = fkJoins.length
    ? `const FK_CONFIG = [\n${fkJoins.map(fk => `  { col: '${fk.colName}', ref: '${fk.refVar}', pk: '${fk.refPkCol}', text: '${fk.refTextCol}' }`).join(',\n')}\n];\n`
    : '';

  // Build select calls — one with FK join fields (for display queries),
  // one without (for CSV export where raw FK values are preferred)
  const fkSelectSpread = fkJoins.length ? `\n      ...buildFkSelectFields(FK_CONFIG)` : '';
  let selectCall: string;
  const selectCallCsv: string = hasExclusions ? `.select({\n${selectArgLines}\n    })` : '.select()';
  if (hasExclusions) {
    selectCall = `.select({\n${selectArgLines}${fkSelectSpread}\n    })`;
  } else if (fkJoins.length) {
    selectCall = `.select({\n      ...table,${fkSelectSpread}\n    })`;
  } else {
    selectCall = selectCallCsv;
  }

  // FK join runtime code — shared by find and findOne
  const fkJoinBlock = fkJoins.length
    ? `  const { query: joinedQuery, joinCols, hasJoins } = addFkJoins(query, FK_CONFIG, table);\n  query = joinedQuery;\n`
    : '';

  // Transform rows for FK display values — find (array) and findOne (single row)
  const fkTransformBlock = fkJoins.length ? `  if (hasJoins) rows = transformFkDisplay(rows, joinCols);\n` : '';
  const fkTransformBlockOne = fkJoins.length ? `  if (hasJoins) row = transformFkDisplayOne(row, joinCols);\n` : '';

  // Add __key to each row (T4T frontend uses it as row key)
  const keyTransformBlock = isCompositePk
    ? `  rows = rows.map(r => ({ ...r, __key: ${pkColNames.map(n => `r.${n}`).join(" + '|' + ")} }));\n`
    : `  rows = rows.map(r => ({ ...r, __key: String(r.${pkColName}) }));\n`;
  const keyTransformBlockOne = isCompositePk
    ? `  row = { ...row, __key: ${pkColNames.map(n => `row.${n}`).join(" + '|' + ")} };\n`
    : `  row = { ...row, __key: String(row.${pkColName}) };\n`;

  // Additional imports when FK joins exist
  const fkExtra = fkJoins.length ? ', buildFkSelectFields, addFkJoins, transformFkDisplay, transformFkDisplayOne' : '';
  const configImportCode = `import supplement from '../t4t-supplement.ts';\nimport { mergeWithSupplement } from '@common/node/t4t/t4t-schema';\nimport { tableRefMap${fkExtra} } from '@common/node/t4t/t4t-utils';\n`;

  return `${AUTO_HEADER(varName)}import * as realServices from '@common/node/services';
import { parse as csvParse } from 'csv-parse/sync';
import { Parser } from '@json2csv/plainjs';
import { ${varName} as table } from '${schemaModule}';
import { and, asc, count, desc, eq, inArray, like, or } from 'drizzle-orm';
${configImportCode}
// biome-ignore lint/suspicious/noExplicitAny: services interface varies by store type
let services: any = realServices;

// Allows unit tests to inject a mock without needing ESM module mocking
// biome-ignore lint/suspicious/noExplicitAny: test injection
export const _injectServices = (mock: any) => {
  services = mock;
};

const db = () => services.get('${dbName}');

${fkConfigCode}
const create = async (req, res) => {
  // Strip empty/null values that survive Zod preprocess
  const body = Object.fromEntries(Object.entries(req.body).filter(([_, v]) => v !== '' && v !== null));
  const result = await db().insert(table).values(body).returning(${pkReturningObj});
  return res.status(201).json(result[0]);
};

const findOne = async (req, res) => {
${pkSplitPrologue}  let query = db()
    ${selectCall}
    .from(table);
${fkJoinBlock}  query = query
    .where(${pkWhereExpr})
    .limit(1);
  const rows = await query;
  if (!rows.length) return res.status(404).json({});
  let row = rows[0];
${keyTransformBlockOne}  return res.status(200).json(row);
};

const update = async (req, res) => {
${pkSplitPrologue}  const result = await db()
    .update(table)
    .set(req.body)
    .where(${pkWhereExpr});
  const count = result.rowCount ?? 0;
  return res.status(count ? 200 : 404).json({ count });
};

const find = async (req, res) => {
  const rawPage = req.query.page ? Number(req.query.page) : 1;
  const page = rawPage < 1 ? 1 : rawPage;
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  const filters = req.query.filters ? JSON.parse(req.query.filters) : null;
  const sorter = req.query.sorter ? JSON.parse(req.query.sorter) : [];
  const csv = req.query.csv;

  const filterConds = [];
  if (filters?.length) {
    for (const f of filters) {
      if (!table[f.col]) continue;
      filterConds.push(f.op === 'like' ? like(table[f.col], '%' + f.val + '%') : eq(table[f.col], f.val));
    }
  }

  const [{ value: total }] = await db()
    .select({ value: count() })
    .from(table)
    .where(and(...filterConds));

  if (csv) {
    let csvQuery = db()
      ${selectCallCsv}
      .from(table);
    if (filterConds.length) csvQuery = csvQuery.where(and(...filterConds));
    if (sorter.length) {
      for (const s of sorter) {
        csvQuery = csvQuery.orderBy(s.order === 'desc' ? desc(table[s.column]) : asc(table[s.column]));
      }
    }
    const csvRows = await csvQuery;
    const parser = new Parser({});
    return res.json({ csv: parser.parse(csvRows) });
  }

  let query = db()
    ${selectCall}
    .from(table);
${fkJoinBlock}  if (filterConds.length) query = query.where(and(...filterConds));
  if (sorter.length) {
    for (const s of sorter) {
      query = query.orderBy(s.order === 'desc' ? desc(table[s.column]) : asc(table[s.column]));
    }
  }

  const maxPage = Math.ceil(Number(total) / limit);
  const effectivePage = page > maxPage ? Math.max(maxPage, 1) : page;
  let rows = await query
    .limit(limit)
    .offset((effectivePage > 0 ? effectivePage - 1 : 0) * limit);

${fkTransformBlock}${keyTransformBlock}  return res.json({ results: rows, total: Number(total) });
};

const remove = async (req, res) => {
${pkSplitPrologue}  const result = await db()
    .delete(table)
    .where(${pkWhereExpr});
  const count = result.rowCount ?? 0;
  return res.status(count ? 200 : 404).json({ count });
};

const removeBatch = async (req, res) => {
  const { ids }: { ids: string[] } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'No ids provided' });
${isCompositePk ? `  for (const id of ids) {\n    const parts = (id as string).split('|');\n    await db().delete(table).where(and(${pkColNames.map((n, j) => `eq(table.${n}, parts[${j}])`).join(', ')}));\n  }\n  return res.json({ deletedRows: ids.length });` : `  const pkValues = ids.map((id: string) => ${pkIsNumeric ? 'Number(id)' : 'id'});\n  const result = await db().delete(table).where(inArray(table.${pkColName}, pkValues));\n  return res.json({ deletedRows: result.rowCount ?? ids.length });`}
};

const autocomplete = async (req, res) => {
  const { key, text, search, limit = 20 } = req.body;
  const conds = [like(table[key], '%' + search + '%'), like(table[text], '%' + search + '%')];
  const rows = await db().select().from(table).where(or(...conds)).limit(Number(limit));
  res.json(rows.map(row => ({
    key: row[key],
    text: row[text],
  })));
};

const upload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const records = csvParse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true });
  const result = await db().insert(table).values(records);
  return res.json({ inserted: result.rowCount ?? records.length });
};

const getConfig = async (_req, res) => {
  const drizzleTable = tableRefMap['${varName}'];
  if (!drizzleTable) return res.json(supplement);
  const merged = mergeWithSupplement('${varName}', drizzleTable as any, supplement);
  const { ref: _ref, db: _db, ...config } = merged as any;
  res.json(config);
};

export default { create, findOne, update, find, remove, removeBatch, autocomplete, upload, getConfig };
`;
}

/**
 * Header comment placed at the top of every sidecar file.
 * Reminds the developer that this file is theirs to edit and will not be overwritten.
 */
const SIDECAR_HEADER = `\
// ─────────────────────────────────────────────────────────────────────────────
// Sidecar — created once, then YOURS. Will NOT be overwritten by generate:crud.
// Extend or override the generated code below as needed.
// ─────────────────────────────────────────────────────────────────────────────
`;

/**
 * Generates the content of a sidecar schema file (`schemas/<table>.schema.js`).
 *
 * The sidecar is created once the first time `generate:crud` runs for the table.
 * It re-exports everything from the corresponding generated schema file so that
 * route imports automatically pick up the latest generated shapes. Developers can
 * add or override exports below the re-export line (e.g. custom search schemas).
 *
 * This file is NEVER overwritten on subsequent runs.
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateSidecarSchema(info: TableInfo): string {
  const { varName, kebabName, pascalName } = info;
  return `${SIDECAR_HEADER}// Re-export everything from generated — add custom schemas below.
export * from './generated/schema.js';

// Example: add a custom search schema
// import { z } from 'zod';
// export const ${pascalName}SearchSchema = z.object({ q: z.string().min(1) }).meta({ id: '${pascalName}Search' });
`;
}

/**
 * Generates the content of a sidecar controller file (`src/controllers/<table>.ts`).
 *
 * The sidecar is created once the first time `generate:crud` runs for the table.
 * It re-exports the generated controller as the default export so the route file
 * continues to work without changes. Developers can override individual handler
 * methods by spreading the generated controller and replacing specific keys.
 *
 * This file is NEVER overwritten on subsequent runs.
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateSidecarController(info: TableInfo): string {
  const { varName } = info;
  return `${SIDECAR_HEADER}// Re-export the generated controller as the default — override methods below.
export { default } from './generated/controller.ts';

// Example: override specific methods
// import generatedController from './generated/controller.ts';
// import type { Request, Response } from 'express';
//
// export default {
//   ...generatedController,
//   create: async (req: Request, res: Response) => {
//     // custom create logic for ${varName}
//   },
// };
`;
}

/**
 * Generates the content of a sidecar routes file (`src/<table>/routes.ts`).
 *
 * The sidecar is created once the first time `generate:crud` runs for the table.
 * By default it re-exports the generated router unchanged. Developers extend it
 * by combining the generated router with their own custom endpoints.
 *
 * This file is NEVER overwritten on subsequent runs.
 *
 * @param info - Aggregated table metadata built in the main loop.
 * @returns The full file content as a UTF-8 string ready to be written to disk.
 */
function generateSidecarRoutes(info: TableInfo): string {
  const { varName, kebabName, pascalName } = info;
  return `${SIDECAR_HEADER}import express from 'express';
import generatedRoutes from './generated/routes.ts';

// Add custom endpoints or override route schemas BEFORE .use('/', generatedRoutes).
// Express matches in registration order — the first matching handler wins.
export default express
  .Router()
  // Example A — new endpoint (add named export to controller.ts first):
  // .get('/search', authUser, validate('query', ${pascalName}SearchSchema), search)
  //
  // Example B — override a route's input schema (export updated schema from schema.js first):
  // .post('/', authUser, validate('body', ${pascalName}BodySchema), ${varName}Controller.create)
  //
  // NOTE: to override just the handler logic (not the schema), only controller.ts is needed.
  // The generated routes import from ../controller.ts so overrides are picked up automatically.
  .use('/', generatedRoutes);
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const appRoot = resolve(process.cwd(), appDir);
const schemaPath = resolve(process.cwd(), schemaFilePath);

// Compute the relative .ts import path from the generated controller location to the schema.
// Controllers are always at src/{entity}/generated/controller.ts — use a placeholder entity
// to compute depth (it's the same for every entity).
const computedSchemaModule = (() => {
  const controllerDir = resolve(appRoot, 'src', '_entity_', 'generated');
  const rel = relative(controllerDir, schemaPath).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
})();
const schemaModule = args['schema-module'] || computedSchemaModule;

// Load config file if present at app root
const configPath = resolve(appRoot, 'generate-crud.config.json');
let config: CrudConfig = {};
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf8')) as CrudConfig;
}

console.log(`\nGenerating CRUD from: ${schemaFilePath}`);
console.log(`App root:             ${appRoot}`);
if (existsSync(configPath)) console.log(`Config:               ${configPath}`);
console.log();

const schemaExports = await import(pathToFileURL(schemaPath).href);

const generated: string[] = [];
const schemaOnlyGenerated: string[] = [];
const skipped: string[] = [];
const sidecarsCreated: string[] = [];

for (const [varName, exported] of Object.entries(schemaExports)) {
  if (!isPgTable(exported)) continue;
  if (tablesFilter && !tablesFilter.includes(varName)) continue;

  // Config: skip excluded tables entirely — no files generated
  if (config.exclude?.includes(varName)) {
    skipped.push(`${varName} (excluded by config)`);
    continue;
  }

  // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
  const columns = getColumns(exported as any);

  // Detect primary key columns — supports column-level .primaryKey() and table-level primaryKey() helper
  // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
  const pkEntries = Object.entries(columns).filter(([, col]) => (col as any).primary === true);
  // For composite PKs defined via primaryKey({ columns: [...] }) table helper
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
  const extraConfigBuilder = (exported as any)[Symbol.for('drizzle:ExtraConfigBuilder')];
  if (extraConfigBuilder) {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
    const extraConfigColumns = (exported as any)[Symbol.for('drizzle:ExtraConfigColumns')];
    const extraConfigs = extraConfigBuilder(extraConfigColumns);
    for (const cfg of extraConfigs) {
      if (cfg.constructor?.name === 'PrimaryKeyBuilder' && cfg.columns?.length) {
        for (const col of cfg.columns) {
          const colName = typeof col === 'string' ? col : col.name;
          const entry = Object.entries(columns).find(([n]) => n === colName);
          if (entry && !pkEntries.some(([n]) => n === entry[0])) {
            pkEntries.push(entry);
          }
        }
      }
    }
  }
  if (!pkEntries.length) {
    skipped.push(`${varName} (no primary key — skipped)`);
    continue;
  }

  const pkColNames = pkEntries.map(([name]) => name);
  const isCompositePk = pkColNames.length > 1;
  const [firstPkColName, pkCol] = pkEntries[0];
  const pkColName = isCompositePk ? '__key' : firstPkColName;
  // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
  const pkSqlType: string = (pkCol as any).getSQLType?.() ?? 'unknown';
  const pkBase = pkSqlType.toLowerCase().split('(')[0].split(' ')[0].trim();
  const pkIsNumeric = ['serial', 'bigserial', 'integer', 'int', 'int2', 'int4', 'int8', 'bigint'].includes(pkBase);

  // Per-table config
  const tableConfig = config.tables?.[varName];
  const excludeFromBodySet = new Set(tableConfig?.excludeFromBody ?? []);
  const excludeFromResponse = tableConfig?.excludeFromResponse ?? [];

  // All column names — used for explicit SELECT when excludeFromResponse is set
  const allColNames = Object.keys(columns);

  // Build body fields — exclude auto-increment PKs (serial), server-managed SQL-expression columns, and config-excluded columns
  const bodyFields: BodyField[] = Object.entries(columns)
    // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
    .filter(([colName, col]) => {
      if (excludeFromBodySet.has(colName)) return false;
      const c = col as any;
      if (!c.primary || isCompositePk) return true;
      // Only exclude auto-increment PKs (serial/bigserial) — manual PKs like varchar go in body
      const sqlType: string = c.getSQLType?.() ?? 'unknown';
      const base = sqlType.toLowerCase().split('(')[0].split(' ')[0].trim();
      return !['serial', 'bigserial'].includes(base);
    })
    .filter(([, col]) => {
      // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
      const c = col as any;
      // SQL expression defaults (e.g. sql`now()`, sql`session_user`, sql`inet_client_addr()`) are
      // server-managed — exclude them from body schemas so clients cannot supply them.
      const defaultVal = c.config?.default;
      const isSqlExpression = defaultVal !== undefined && typeof defaultVal?.getSQL === 'function';
      return !isSqlExpression;
    })
    .map(([colName, col]) => {
      // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
      const c = col as any;
      const sqlType: string = c.getSQLType?.() ?? 'unknown';
      const notNull: boolean = c.notNull ?? false;
      const hasDefault: boolean = c.hasDefault ?? false;
      return {
        name: colName,
        zodCode: sqlTypeToZodCode(sqlType),
        required: notNull && !hasDefault,
        sqlType,
      };
    });

  // Build response fields — ALL columns minus excludeFromResponse, used for ResponseSchema and OpenAPI
  const responseFields: ResponseField[] = Object.entries(columns)
    .filter(([colName]) => !excludeFromResponse.includes(colName))
    .map(([colName, col]) => {
      // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
      const c = col as any;
      const sqlType: string = c.getSQLType?.() ?? 'unknown';
      const notNull: boolean = c.notNull ?? false;
      return {
        name: colName,
        zodCode: sqlTypeToZodCode(sqlType),
        nullable: !notNull,
      };
    });

  const kebabName = toKebabCase(varName);
  const pascalName = toPascalCase(varName);

  // ── FK join detection ──────────────────────────────────────────────────
  // Detect FK constraints from the Drizzle schema and match against supplement options.text
  const InlineForeignKeysSym = Symbol.for('drizzle:PgInlineForeignKeys');
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
  const rawFks: any[] = (exported as any)[InlineForeignKeysSym] ?? [];
  const schemaVarMap: Record<string, string> = {};
  for (const [key, val] of Object.entries(schemaExports)) {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
    if (val && typeof val === 'object' && (val as any)?.constructor?.name === 'PgTable') {
      // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
      schemaVarMap[(val as any)[Symbol.for('drizzle:Name')] ?? key] = key;
    }
  }
  // Try loading supplement to get options.text for FK display columns
  // biome-ignore lint/suspicious/noExplicitAny: supplement shape is per-table
  let supplementCols: Record<string, any> = {};
  try {
    const suppPath = resolve(appRoot, 'src', kebabName, 't4t-supplement.ts');
    const mod = await import(pathToFileURL(suppPath).href);
    supplementCols = mod.default?.cols ?? {};
  } catch {}
  const fkJoins: FkJoinInfo[] = [];
  for (const fk of rawFks) {
    const ref = fk.reference?.();
    if (!ref?.columns?.length || !ref?.foreignColumns?.length || !ref?.foreignTable) continue;
    const localColName = ref.columns[0].name;
    const refTextCol = supplementCols[localColName]?.options?.text;
    if (!refTextCol) continue;
    const foreignDbName = ref.foreignTable[Symbol.for('drizzle:Name')];
    const refVar = schemaVarMap[foreignDbName];
    if (!refVar) continue;
    const refPkCol = ref.foreignColumns[0].name;
    fkJoins.push({ colName: localColName, refVar, refPkCol, refTextCol });
  }

  const info: TableInfo = {
    varName,
    pascalName,
    kebabName,
    pkColName,
    pkColNames,
    isCompositePk,
    pkIsNumeric,
    bodyFields,
    responseFields,
    allColNames,
    excludeFromResponse,
    fkJoins,
  };

  const tableDir = resolve(appRoot, 'src', kebabName);
  const tableGenDir = resolve(tableDir, 'generated');

  // ── Always generate the Zod schema file ───────────────────────────────────
  writeFile(resolve(tableGenDir, 'schema.js'), generateSchemaFile(info));

  // Config: schemaOnly — skip routes, controllers, and sidecars
  if (config.schemaOnly?.includes(varName)) {
    schemaOnlyGenerated.push(varName);
    continue;
  }

  // ── Generated route + controller files — always overwrite ─────────────────
  writeFile(resolve(tableGenDir, 'routes.ts'), generateRouteFile(info));
  writeFile(resolve(tableGenDir, 'controller.ts'), generateControllerFile(info));

  // ── Sidecar files — create once, then developer owns them ─────────────────
  const sidecarSchemaPath = resolve(tableDir, 'schema.js');
  const sidecarControllerPath = resolve(tableDir, 'controller.ts');
  const sidecarRoutesPath = resolve(tableDir, 'routes.ts');

  const schemaNew = writeIfAbsent(sidecarSchemaPath, generateSidecarSchema(info));
  const controllerNew = writeIfAbsent(sidecarControllerPath, generateSidecarController(info));
  const routesNew = writeIfAbsent(sidecarRoutesPath, generateSidecarRoutes(info));

  if (schemaNew || controllerNew || routesNew) sidecarsCreated.push(varName);

  generated.push(varName);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

if (generated.length === 0 && schemaOnlyGenerated.length === 0 && skipped.length === 0) {
  console.log('No pgTable exports found in the schema file.');
  process.exit(0);
}

console.log(`Generated (${generated.length}):`);
for (const name of generated) {
  const kebab = toKebabCase(name);
  const tCfg = config.tables?.[name];
  const bodyNote = tCfg?.excludeFromBody?.length ? ` [body: -${tCfg.excludeFromBody.length} fields]` : '';
  const responseNote = tCfg?.excludeFromResponse?.length
    ? ` [response: -${tCfg.excludeFromResponse.length} fields]`
    : '';
  console.log(`  ${name}${bodyNote}${responseNote}`);
  console.log(`    src/${kebab}/generated/schema.js      (overwritten)`);
  console.log(`    src/${kebab}/generated/routes.ts      (overwritten)`);
  console.log(`    src/${kebab}/generated/controller.ts  (overwritten)`);
}

if (schemaOnlyGenerated.length) {
  console.log(`\nSchema only (${schemaOnlyGenerated.length}) — Zod schema generated, no routes/controllers:`);
  for (const name of schemaOnlyGenerated) {
    const kebab = toKebabCase(name);
    console.log(`  ${name}`);
    console.log(`    src/${kebab}/generated/schema.js    (overwritten)`);
  }
}

if (skipped.length) {
  console.log(`\nSkipped (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
}

if (sidecarsCreated.length) {
  console.log(`\nSidecars created (once — yours to edit):`);
  for (const name of sidecarsCreated) {
    const kebab = toKebabCase(name);
    console.log(`  src/${kebab}/schema.js`);
    console.log(`  src/${kebab}/controller.ts`);
    console.log(`  src/${kebab}/routes.ts`);
  }
}

if (generated.length) {
  const prefix = routePrefix ? `${routePrefix}` : '';
  console.log(`\nNext step — mount routes in src/router.ts:`);
  for (const name of generated) {
    const kebab = toKebabCase(name);
    console.log(`  import ${name}Route from './${kebab}/routes.ts';`);
    console.log(`  router.use('/${kebab}', ${name}Route); // ${prefix}/${kebab}`);
  }
}

console.log();
