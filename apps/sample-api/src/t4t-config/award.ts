import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'award',
  conn: 'drizzle1',
  displayName: 'Award',
  view: 'admin,editor,viewer',
  create: 'admin',
  update: 'admin,editor',
  delete: 'admin',
  import: 'admin,editor',
  export: 'admin,editor',
  deleteLimit: 1,
  multiSelect: false,
  cols: {
    code: { label: 'Code', auto: 'pk', edit: 'readonly' },
    name: { label: 'Name', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
  },
} satisfies T4tTableConfig;
