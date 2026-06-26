import type { NextFunction, Request, Response } from 'express';

// ─── Column definition loaded from YAML table config ─────────────────────────

export interface ColDef {
  label?: string;
  required?: boolean;
  multiKey?: boolean;
  auto?: string | false;
  editor?: string | boolean;
  edit?: boolean | string;
  creator?: string | boolean;
  add?: boolean | string;
  hide?: 'omit' | 'blank';
  type?: string;
  filter?: boolean;
  sort?: boolean;
  default?: unknown;
  rules?: Record<string, unknown>;
  comment?: string;
  link?: {
    display?: string;
    text?: string;
    keys?: string;
    ctable?: string;
    ckeys?: string;
    [key: string]: unknown;
  };
  ui?: {
    tag?: string;
    attrs?: {
      type?: string;
      pattern?: string;
      maxLength?: number;
      maxlength?: number;
      min?: number | string;
      max?: number | string;
    };
    [key: string]: unknown;
  };
  options?: {
    foreignKey?: string;
    tableName?: string;
    key?: string;
    text?: string;
    column?: string;
    joinFromTable?: string;
    conn?: string;
    parentCol?: string;
    parentTableColName?: string;
    childCol?: string;
    limit?: number;
    strict?: boolean;
    display?: string;
    [key: string]: unknown;
  };
}

// ─── Table definition built from config + middleware augmentation ─────────────

export interface TableDef {
  name: string;
  conn: string;
  pk: string;
  multiKey: string[];
  required: string[];
  auto: string[];
  cols: Record<string, ColDef>;
  displayName?: string;
  audit?: boolean | string;
  multiSelect?: boolean;
  view: string | boolean;
  create: string | boolean;
  update: string | boolean;
  delete: string | boolean;
  import: string | boolean;
  export: string | boolean;
  select?: string;
  defaultSort?: unknown[];
  deleteLimit: number;
  fileConfigUi: Record<string, unknown>;
  db: string;
  /** Drizzle table reference object — set at startup from schema lookup. Used instead of raw string table name. */
  ref?: unknown;
}

// ─── Config file shape (what the developer writes in .ts, before middleware enrichment) ──
// Omits fields that generateTable derives at runtime.
export type T4tTableConfig = Omit<TableDef, 'pk' | 'multiKey' | 'required' | 'auto' | 'fileConfigUi' | 'db'>;

// ─── Supplement config shape (Phase 2 — developer writes this, schema fills the rest)
// Omits everything the Drizzle schema can introspect: column types, required, auto, PK, FKs.
// The developer only supplies labels, permissions, UI config, and non-derivable options.
export interface T4tSupplement {
  displayName?: string;
  view?: string | boolean;
  create?: string | boolean;
  update?: string | boolean;
  delete?: string | boolean;
  import?: string | boolean;
  export?: string | boolean;
  deleteLimit?: number;
  multiSelect?: boolean;
  audit?: boolean | string;
  defaultSort?: unknown[];
  cols?: Record<string, ColDef>;
}

// ─── Relation metadata returned by mapRelation ────────────────────────────────

export interface RelationDef {
  table2: string;
  table2Id: string;
  table2Text: string;
  table1Id: string;
  tableJoinFrom: string;
  table2Column: string;
}

// ─── Express Request extended with t4t table context ─────────────────────────

export interface T4TRequest extends Request {
  table: TableDef;
  fileCount?: Record<string, number>;
}

// ─── File upload UI configuration ────────────────────────────────────────────

export interface FileUiConfig {
  multer: {
    folder?: string;
    options?: { limits?: { files?: number } };
  };
}

// ─── t4t router options ───────────────────────────────────────────────────────

export interface T4TOptions {
  authFunc?: (req: Request, res: Response, next: NextFunction) => void;
  /** Drizzle schema object(s) (e.g. `import * as schema from './database/schema.ts'`)
   *  — used to look up table references for Drizzle queries.
   *  Accepts a single schema or an array of schemas (for multi-schema setups like IAM, audit). */
  schema?: Record<string, unknown> | Record<string, unknown>[];
}

// ─── Internal types ───────────────────────────────────────────────────────────

export type InvalidInputResult = { status: string; message: string; key?: string | null } | false;

export interface AuditData {
  user: string;
  timestamp: Date;
  db_name: string;
  table_name: string;
  op: string;
  where_cols: string;
  where_vals: string;
  cols_changed: string;
  prev_values: string;
  new_values: string;
}
