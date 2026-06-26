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
import { getColumns, isPgTable } from '../../common/compiled/node/services/db/introspect.ts';

function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^-/, '');
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
const generated: string[] = [];

for (const [varName, exported] of Object.entries(schemaExports)) {
  if (!isPgTable(exported)) continue;
  if (tablesFilter && !tablesFilter.includes(varName)) continue;

  const kebab = toKebabCase(varName);
  const t4tDir = resolve(appRoot, 'src', kebab);

  // biome-ignore lint/suspicious/noExplicitAny: drizzle internals
  const columns = getColumns(exported as any);

  const displayName =
    varName.charAt(0).toUpperCase() +
    varName
      .slice(1)
      .replace(/([A-Z])/g, ' $1')
      .trim();

  // Check for FK references to determine if `text` hint is needed
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table internals
  const tableConfig = (exported as any).config;
  const fkCols = new Set<string>();
  if (tableConfig?.foreignKeys) {
    for (const fk of tableConfig.foreignKeys) {
      if (!fk.columns?.length) continue;
      for (const localCol of fk.columns) {
        const name = Object.entries(columns).find(([, c]) => c === localCol)?.[0];
        if (name) fkCols.add(name);
      }
    }
  }

  const cols: string[] = [];
  for (const [colName, col] of Object.entries(columns)) {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle column internals
    const c = col as any;
    const isPk: boolean = c.primary ?? false;
    const isSerial: boolean = ['serial', 'bigserial'].includes(
      (c.getSQLType?.() ?? '').toLowerCase().split('(')[0].trim(),
    );

    const label =
      colName.charAt(0).toUpperCase() +
      colName
        .slice(1)
        .replace(/([A-Z])/g, ' $1')
        .trim();
    const items: string[] = [];
    items.push(`label: '${label}'`);
    if (isPk || isSerial) items.push("edit: 'readonly'");
    else {
      items.push('add: true');
      items.push('edit: true');
      items.push('filter: true');
      if (fkCols.has(colName)) {
        items.push("options: { text: 'name' }");
      }
    }

    cols.push(`    ${colName}: { ${items.join(', ')} }`);
  }

  const colLines = cols.join(',\n');

  const content = `// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED SCAFFOLD — edit freely. Will NOT be overwritten on re-run.
// Adjust labels, permissions, UI tags, and FK display columns as needed.
// ─────────────────────────────────────────────────────────────────────────────
import type { T4tSupplement } from '@common/node/t4t/types';

export default {
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
} satisfies T4tSupplement;
`;

  const filePath = resolve(t4tDir, 't4t-supplement.ts');
  mkdirSync(t4tDir, { recursive: true });

  if (existsSync(filePath)) {
    console.log(`  ${kebab}/t4t-supplement.ts — already exists, skipped`);
    continue;
  }

  writeFileSync(filePath, content, 'utf8');
  generated.push(varName);
  console.log(`  ${kebab}/t4t-supplement.ts — created`);
}

if (generated.length === 0) {
  console.log('No tables generated (all configs already exist or no pgTable exports found).');
} else {
  console.log(`\nGenerated ${generated.length} supplement(s) in src/<table>/t4t-supplement.ts`);
  console.log('Review and edit: labels, permissions, UI tags, FK text columns.\n');
}
