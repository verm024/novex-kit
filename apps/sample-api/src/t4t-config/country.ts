import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'country',
  conn: 'drizzle1',
  displayName: 'Country',
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
    name: { label: 'Name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    code: { label: 'Code', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    icc: { label: 'Icc', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    updated: { label: 'Updated', type: 'datetime', add: true, edit: true, filter: true },
  },
} satisfies T4tTableConfig;
