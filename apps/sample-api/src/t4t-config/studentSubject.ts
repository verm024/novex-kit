import type { T4tTableConfig } from '@common/node/t4t/types';

export default {
  name: 'studentSubject',
  conn: 'drizzle1',
  displayName: 'Student Subject',
  view: 'admin,editor,viewer',
  create: 'admin',
  update: 'admin,editor',
  delete: 'admin',
  import: 'admin,editor',
  export: 'admin,editor',
  deleteLimit: 1,
  multiSelect: false,
  cols: {
    studentId: { label: 'Student Id', type: 'integer', required: true, add: true, edit: true, filter: true },
    subjectCode: {
      label: 'Subject Code',
      type: 'string',
      required: true,
      add: true,
      edit: true,
      filter: true,
      ui: { tag: 'input' },
    },
    gradeFinal: { label: 'Grade Final', type: 'string', add: true, edit: true, filter: true, ui: { tag: 'input' } },
    gradeDate: { label: 'Grade Date', type: 'datetime', add: true, edit: true, filter: true },
  },
} satisfies T4tTableConfig;
