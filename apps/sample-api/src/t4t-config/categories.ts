import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'categories',
  conn: 'drizzle1',
  displayName: 'Categories',
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
    name: { label: 'Name', type: 'string', required: true, add: true, edit: true, filter: true, ui: { tag: 'input' } },
    description: { label: 'Description', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
  },
} satisfies T4tTableConfig;
