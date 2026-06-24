import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'state',
  conn: 'drizzle1',
  displayName: 'State',
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
    country_name: { label: 'Country_name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    code: { label: 'Code', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    name: { label: 'Name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
  },
} satisfies T4tTableConfig;
