import type { Knex } from 'knex';
import countriesJson from './icc.json' with { type: 'json' };
import statesJson from './state.json' with { type: 'json' };

export async function seed(knex: Knex): Promise<void> {
  await knex('student_subject').del();
  await knex('subject').del();
  await knex('student').del();
  await knex('award').del();
  await knex('country').del();
  await knex('state').del();

  const countries = countriesJson.map(c => ({ ...c, updated: new Date().toISOString() }));
  await knex('country').insert(countries);
  await knex('state').insert(statesJson);

  await knex('subject').insert([
    { code: 'EL1', name: 'English', passingGrade: 40 },
    { code: 'EM', name: 'E Math', passingGrade: 41 },
    { code: 'AM', name: 'A Math', passingGrade: 42 },
    { code: 'PHY', name: 'Physics', passingGrade: 43 },
    { code: 'CHEM', name: 'Chemistry', passingGrade: 44 },
  ]);

  await knex('award').insert([
    { code: 'ac', name: 'Academic' },
    { code: 'sp', name: 'Sports' },
    { code: 'cv', name: 'Civics' },
  ]);

  const students = Array.from({ length: 30 }, (_, idx) => ({
    firstName: 'first',
    lastName: `last${idx}`,
    avatar: '',
    kyc: '',
    awards: '',
    sex: idx % 2 === 0 ? 'M' : 'F',
    age: idx + 15,
    gpa: (idx + 1) % 5,
    birthDate: '1976-04-19',
    birthTime: '0600',
    country: 'SG',
    state: '',
    dateTimeTz: new Date().toISOString(),
    secret: '1234',
    remarks: '',
    updated_by: 'someone',
    updated_at: new Date().toISOString(),
  }));
  const insertedStudents = await knex('student').insert(students).returning('id');
  const s1: number = insertedStudents[0].id ?? insertedStudents[0];
  const s2: number = insertedStudents[1].id ?? insertedStudents[1];

  await knex('student_subject').insert([
    { studentId: s1, subjectCode: 'EM', gradeFinal: 'A', gradeDate: '2024-10-01' },
    { studentId: s1, subjectCode: 'AM', gradeFinal: 'B', gradeDate: '2024-10-01' },
    { studentId: s1, subjectCode: 'PHY', gradeFinal: 'D', gradeDate: '2024-10-01' },
    { studentId: s2, subjectCode: 'EM', gradeFinal: 'C', gradeDate: '2024-10-02' },
    { studentId: s2, subjectCode: 'CHEM', gradeFinal: 'B', gradeDate: '2024-10-02' },
  ]);
}
