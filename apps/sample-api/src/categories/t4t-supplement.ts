import type { T4tSupplement } from '@common/node/t4t/types';

export default {
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
    id: { label: 'Id', edit: 'readonly' },
    name: { label: 'Name', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    description: { label: 'Description', add: true, edit: true, filter: true, ui: { tag: 'input' } },
  },
} satisfies T4tSupplement;
