import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'subject',
  conn: 'drizzle1',
  displayName: 'Subject',
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
    passingGrade: { label: 'Passing Grade', type: 'integer', add: true, edit: true, filter: true },
  },
} satisfies T4tTableConfig;
