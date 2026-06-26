import { getColumns, sqlTypeToT4t } from '../services/db/introspect.ts';
import type { ColDef, T4tSupplement, TableDef } from './types.ts';

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pascalToLabel(str: string): string {
  return capitalize(str.replace(/([A-Z])/g, ' $1').trim());
}

export function toKebabCase(str: string): string {
  return str
    .replace(/_/g, '-')
    .replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
    .replace(/^-/, '');
}

interface IntrospectedColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  hasDefault: boolean;
  isSerial: boolean;
}

interface IntrospectedFkRef {
  tableName: string;
  key: string;
  column: string;
}

function introspectColumns(drizzleTable: object): {
  columns: Record<string, IntrospectedColumn>;
  fkRefs: Record<string, IntrospectedFkRef>;
} {
  const cols = getColumns(drizzleTable);
  const result: Record<string, IntrospectedColumn> = {};
  const fkRefs: Record<string, IntrospectedFkRef> = {};

  const tableConfig = (drizzleTable as any).config;

  for (const [name, col] of Object.entries(cols)) {
    const c = col as any;
    const sqlType: string = c.getSQLType?.() ?? 'string';
    const t4tType = sqlTypeToT4t(sqlType);
    const isPk: boolean = c.primary ?? false;
    const notNull: boolean = c.notNull ?? false;
    const hasDefault: boolean = c.hasDefault ?? false;
    const isSerial: boolean = ['serial', 'bigserial'].includes(sqlType.toLowerCase().split('(')[0].trim());

    result[name] = { name, type: t4tType, notNull, primaryKey: isPk, hasDefault, isSerial };
  }

  if (tableConfig?.foreignKeys) {
    for (const fk of tableConfig.foreignKeys) {
      if (!fk.columns?.length) continue;
      for (const localCol of fk.columns) {
        const name = Object.entries(cols).find(([, c]) => c === localCol)?.[0];
        if (!name) continue;

        const foreignTable = fk.reference?.() || fk.foreignTable;
        const refTableName = foreignTable?.constructor?.name || '';
        const foreignCols = fk.foreignColumns;
        const refColName = foreignCols?.[0]?.name || 'id';
        const refColColumn = foreignCols?.[0]?.column || refColName;

        fkRefs[name] = { tableName: refTableName, key: refColName, column: refColColumn };
      }
    }
  }

  return { columns: result, fkRefs };
}

export function mergeWithSupplement(
  tableKey: string,
  drizzleTable: object | null,
  supplement: T4tSupplement,
): TableDef {
  const { columns: introColumns, fkRefs } = drizzleTable
    ? introspectColumns(drizzleTable)
    : { columns: {}, fkRefs: {} };

  const base: TableDef = {
    name: tableKey,
    conn: 'drizzle1',
    pk: '',
    multiKey: [],
    required: [],
    auto: [],
    cols: {},
    view: true,
    create: true,
    update: true,
    delete: true,
    import: true,
    export: true,
    deleteLimit: -1,
    multiSelect: false,
    fileConfigUi: {},
    db: 'drizzle1',
    displayName: supplement.displayName ?? capitalize(tableKey),
    audit: supplement.audit ?? false,
    defaultSort: supplement.defaultSort ?? [],
  };

  const allColNames = new Set([...Object.keys(introColumns), ...Object.keys(supplement.cols ?? {})]);

  for (const colName of allColNames) {
    const intro = introColumns[colName];
    const suppCol = supplement.cols?.[colName];

    const colDef: ColDef = {};

    // ── Schema-derived values (overridable by supplement) ──
    if (intro) {
      colDef.type = intro.type;

      if (intro.isSerial) {
        colDef.auto = 'pk';
        base.pk = colName;
      } else if (intro.primaryKey) {
        base.pk = colName;
      }

      if (intro.notNull && !intro.hasDefault && !intro.primaryKey && !intro.isSerial) {
        base.required.push(colName);
      }

      // FK reference from schema
      const fk = fkRefs[colName];
      if (fk) {
        colDef.options = {
          foreignKey: colName,
          tableName: fk.tableName,
          key: fk.key,
          column: fk.column,
          joinFromTable: tableKey,
        };
      }
    }

    // ── Supplement overrides ──
    if (suppCol) {
      if (suppCol.label !== undefined) colDef.label = suppCol.label;
      if (suppCol.add !== undefined) colDef.add = suppCol.add;
      if (suppCol.edit !== undefined) colDef.edit = suppCol.edit;
      if (suppCol.filter !== undefined) colDef.filter = suppCol.filter;
      if (suppCol.sort !== undefined) colDef.sort = suppCol.sort;
      if (suppCol.hide !== undefined) colDef.hide = suppCol.hide;
      if (suppCol.default !== undefined) colDef.default = suppCol.default;
      if (suppCol.ui !== undefined) colDef.ui = suppCol.ui;
      if (suppCol.editor !== undefined) colDef.editor = suppCol.editor;
      if (suppCol.creator !== undefined) colDef.creator = suppCol.creator;
      if (suppCol.rules !== undefined) colDef.rules = suppCol.rules;
      if (suppCol.comment !== undefined) colDef.comment = suppCol.comment;
      if (suppCol.link !== undefined) colDef.link = suppCol.link;
      if (suppCol.type !== undefined) colDef.type = suppCol.type;
      if (suppCol.auto !== undefined) {
        colDef.auto = suppCol.auto;
        if (suppCol.auto !== 'pk') base.auto.push(colName);
      }
      if (suppCol.multiKey !== undefined) {
        colDef.multiKey = suppCol.multiKey;
        if (suppCol.multiKey) base.multiKey.push(colName);
      }
      if (suppCol.required !== undefined) {
        colDef.required = suppCol.required;
        if (suppCol.required && !base.required.includes(colName)) base.required.push(colName);
      }
      if (suppCol.options) {
        colDef.options = { ...colDef.options, ...suppCol.options };
      }
    }

    // ── Defaults for missing fields ──
    if (colDef.label === undefined) colDef.label = pascalToLabel(colName);
    if (colDef.add === undefined && colDef.auto !== 'pk') colDef.add = true;
    if (colDef.edit === undefined) colDef.edit = true;
    if (colDef.filter === undefined) colDef.filter = true;
    if (colDef.sort === undefined) colDef.sort = false;

    // File upload detection
    if (colDef.ui?.tag === 'files') base.fileConfigUi[colName] = colDef.ui;

    base.cols[colName] = colDef;
  }

  // ── Table-level supplement overrides ──
  if (supplement.view !== undefined) base.view = supplement.view;
  if (supplement.create !== undefined) base.create = supplement.create;
  if (supplement.update !== undefined) base.update = supplement.update;
  if (supplement.delete !== undefined) base.delete = supplement.delete;
  if (supplement.import !== undefined) base.import = supplement.import;
  if (supplement.export !== undefined) base.export = supplement.export;
  if (supplement.deleteLimit !== undefined) base.deleteLimit = supplement.deleteLimit;
  if (supplement.multiSelect !== undefined) base.multiSelect = supplement.multiSelect;
  if (supplement.displayName !== undefined) base.displayName = supplement.displayName;
  if (supplement.audit !== undefined) base.audit = supplement.audit;
  if (supplement.defaultSort !== undefined) base.defaultSort = supplement.defaultSort;

  return base;
}
