import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 't4tAuditLogs',
  conn: 'drizzle1',
  displayName: 'T4t Audit Logs',
  view: 'admin,editor,viewer',
  create: 'admin',
  update: 'admin,editor',
  delete: 'admin',
  import: 'admin,editor',
  export: 'admin,editor',
  deleteLimit: 1,
  multiSelect: false,
  cols: {
    id: { label: 'Id', auto: 'pk', edit: 'readonly' },
    user: { label: 'User', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    timestamp: { label: 'Timestamp', type: 'datetime', add: true, edit: true, filter: true },
    db_name: { label: 'Db_name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    table_name: { label: 'Table_name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    op: { label: 'Op', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    where_cols: { label: 'Where_cols', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    where_vals: { label: 'Where_vals', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    cols_changed: { label: 'Cols_changed', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    prev_values: { label: 'Prev_values', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    new_values: { label: 'New_values', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
  },
} satisfies T4tTableConfig;
