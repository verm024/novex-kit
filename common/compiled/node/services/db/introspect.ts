const ENTITY_KIND = Symbol.for('drizzle:entityKind');
const TABLE_COLUMNS = Symbol.for('drizzle:Columns');

export function isPgTable(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && (obj as any)?.constructor?.[ENTITY_KIND] === 'PgTable';
}

export function getColumns(table: object): Record<string, any> {
  return (table as any)[TABLE_COLUMNS] ?? {};
}

export function sqlTypeToT4t(sqlType: string): string {
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
