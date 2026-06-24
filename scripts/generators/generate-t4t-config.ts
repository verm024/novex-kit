#!/usr/bin/env node
// scripts/generators/generate-t4t-config.ts
//
// Generates T4T table config files (.ts) from a Drizzle schema.
// Created once, never overwritten — developer edits labels, permissions, UI tags.
//
// Usage (run from the target app directory):
//   node ../../scripts/generators/generate-t4t-config.ts \
//     --schema   ./src/database/schema.ts \
//     --app      .
//     [--tables  student,subject] \
//     [--conn    drizzle1]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENTITY_KIND = Symbol.for('drizzle:entityKind');
const TABLE_COLUMNS = Symbol.for('drizzle:Columns');

function isPgTable(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && (obj as any)?.constructor?.[ENTITY_KIND] === 'PgTable';
}

// biome-ignore lint/suspicious/noExplicitAny: drizzle internals
function getColumns(table: object): Record<string, any> {
  return (table as any)[TABLE_COLUMNS] ?? {};
}

function sqlTypeToT4t(sqlType: string): string {
  const base = sqlType.toLowerCase().split('(')[0].split(' ')[0].trim();
  switch (base) {
    case 'serial':
    case 'bigserial':
    case 'integer':
    case 'int':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'bigint':
      return 'integer';
    case 'numeric':
    case 'decimal':
      return 'decimal';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'timestamp':
    case 'timestamptz':
      return 'datetime';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'jsonb':
    case 'json':
      return 'string';
    default:
      return 'string';
  }
}

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
const tablesFilter = args.tables ? args.tables.split(',').map(s => s.trim()) : null;
const connName = args.conn || 'drizzle1';

if (!schemaFilePath || !appDir) {
  console.error(`
Usage: node scripts/generators/generate-t4t-config.ts \\
  --schema  <path>    Path to Drizzle schema .ts file (relative to cwd)
  --app     <dir>     App root directory (relative to cwd)
  [--tables <t1,t2>]  Comma-separated table variable names (omit for all)
  [--conn   <name>]   Connection name (default: drizzle1)
`);
  process.exit(1);
}

const appRoot = resolve(process.cwd(), appDir);
const schemaPath = resolve(process.cwd(), schemaFilePath);

console.log(`\nGenerating T4T configs from: ${schemaFilePath}`);
console.log(`App root:                    ${appRoot}\n`);

const schemaExports = await import(pathToFileURL(schemaPath).href);
const t4tDir = resolve(appRoot, 'src', 't4t-config');
const generated: string[] = [];

for (const [varName, exported] of Object.entries(schemaExports)) {
  if (!isPgTable(exported)) continue;
  if (tablesFilter && !tablesFilter.includes(varName)) continue;

  // biome-ignore lint/suspicious/noExplicitAny: drizzle internals
  const columns = getColumns(exported as any);

  // Determine table name used in the DB (first arg to pgTable)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle internals
  const dbTableName: string = (exported as any).constructor?.name || varName;
  const displayName =
    varName.charAt(0).toUpperCase() +
    varName
      .slice(1)
      .replace(/([A-Z])/g, ' $1')
      .trim();

  const cols: string[] = [];
  for (const [colName, col] of Object.entries(columns)) {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
    const c = col as any;
    const sqlType: string = c.getSQLType?.() ?? 'string';
    const t4tType = sqlTypeToT4t(sqlType);
    const isPk: boolean = c.primary ?? false;
    const notNull: boolean = c.notNull ?? false;
    const hasDefault: boolean = c.hasDefault ?? false;
    const isSerial: boolean = ['serial', 'bigserial'].includes(sqlType.toLowerCase().split('(')[0].trim());

    // Check for FK references via drizzle table config
    // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
    const tableConfig = (exported as any).config;
    let fkInfo: string | null = null;
    if (tableConfig?.foreignKeys) {
      for (const fk of tableConfig.foreignKeys) {
        // biome-ignore lint/suspicious/noExplicitAny: drizzle FK internals
        if (fk.columns?.includes(c)) {
          // biome-ignore lint/suspicious/noExplicitAny: drizzle FK internals
          const refTableName = fk.reference?.()?.name || fk.foreignTable?.constructor?.name || '';
          const refColName = colName; // same name is most common
          fkInfo = `options: { conn: '${connName}', tableName: '${refTableName}', key: 'id', text: 'name' }`;
        }
      }
    }

    const label =
      colName.charAt(0).toUpperCase() +
      colName
        .slice(1)
        .replace(/([A-Z])/g, ' $1')
        .trim();
    const items: string[] = [];
    items.push(`label: '${label}'`);
    if (isPk || isSerial) items.push("auto: 'pk'");
    if (isPk) items.push("edit: 'readonly'");
    else if (isSerial) items.push("edit: 'readonly'");
    else {
      items.push("type: '" + t4tType + "'");
      if (notNull && !hasDefault) items.push('required: true');
      items.push('add: true');
      items.push('edit: true');
      items.push('filter: true');
      if (t4tType === 'string' && !isPk) items.push("ui: { tag: 'input' }");
    }
    if (fkInfo) items.push(fkInfo);

    cols.push(`    ${colName}: { ${items.join(', ')} }`);
  }

  const colLines = cols.join(',\n');

  const content = `import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: '${varName}',
  conn: '${connName}',
  displayName: '${displayName}',
  view: 'admin,editor,viewer',
  create: 'admin',
  update: 'admin,editor',
  delete: 'admin',
  import: 'admin,editor',
  export: 'admin,editor',
  deleteLimit: 1,
  multiSelect: false,
  cols: {
${colLines},
  },
} satisfies T4tTableConfig;
`;

  const filePath = resolve(t4tDir, `${varName}.ts`);
  mkdirSync(t4tDir, { recursive: true });

  if (existsSync(filePath)) {
    console.log(`  ${varName}.ts — already exists, skipped`);
    continue;
  }

  writeFileSync(filePath, content, 'utf8');
  generated.push(varName);
  console.log(`  ${varName}.ts — created`);
}

if (generated.length === 0) {
  console.log('No tables generated (all configs already exist or no pgTable exports found).');
} else {
  console.log(`\nGenerated ${generated.length} config(s) in src/t4t-config/`);
  console.log('Review and edit: labels, permissions, UI tags, FK text columns.\n');
}
