// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: users
// ─────────────────────────────────────────────────────────────────────────────
import * as realServices from '@common/node/services';
import { parse as csvParse } from 'csv-parse/sync';
import { Parser } from '@json2csv/plainjs';
import { users as table } from '../../database/schema.ts';
import { and, asc, count, desc, eq, inArray, like, or } from 'drizzle-orm';
import supplement from '../t4t-supplement.ts';
import { mergeWithSupplement } from '@common/node/t4t/t4t-schema';
import { tableRefMap } from '@common/node/t4t/t4t-utils';

// biome-ignore lint/suspicious/noExplicitAny: services interface varies by store type
let services: any = realServices;

// Allows unit tests to inject a mock without needing ESM module mocking
// biome-ignore lint/suspicious/noExplicitAny: test injection
export const _injectServices = (mock: any) => {
  services = mock;
};

const db = () => services.get('drizzle1');


const create = async (req, res) => {
  // Strip empty/null values that survive Zod preprocess
  const body = Object.fromEntries(Object.entries(req.body).filter(([_, v]) => v !== '' && v !== null));
  const result = await db().insert(table).values(body).returning({ id: table.id });
  return res.status(201).json(result[0]);
};

const findOne = async (req, res) => {
  let query = db()
    .select({
      id: table.id,
      roles: table.roles,
      tenant_id: table.tenant_id,
      username: table.username,
      email: table.email,
      githubId: table.githubId,
      role: table.role,
      retryLimit: table.retryLimit,
      retryCount: table.retryCount,
      retryReset: table.retryReset,
      pnToken: table.pnToken,
      revoked: table.revoked,
      sms: table.sms,
      smsLastSent: table.smsLastSent,
      smsVerified: table.smsVerified,
      telegramId: table.telegramId,
      telegramUsername: table.telegramUsername,
    })
    .from(table);
  query = query
    .where(eq(table.id, Number(req.params.id)))
    .limit(1);
  const rows = await query;
  if (!rows.length) return res.status(404).json({});
  let row = rows[0];
  row = { ...row, __key: String(row.id) };
  return res.status(200).json(row);
};

const update = async (req, res) => {
  const result = await db()
    .update(table)
    .set(req.body)
    .where(eq(table.id, Number(req.params.id)));
  const count = result.rowCount ?? 0;
  return res.status(count ? 200 : 404).json({ count });
};

const find = async (req, res) => {
  const rawPage = req.query.page ? Number(req.query.page) : 1;
  const page = rawPage < 1 ? 1 : rawPage;
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  const filters = req.query.filters ? JSON.parse(req.query.filters) : null;
  const sorter = req.query.sorter ? JSON.parse(req.query.sorter) : [];
  const csv = req.query.csv;

  const filterConds = [];
  if (filters?.length) {
    for (const f of filters) {
      if (!table[f.col]) continue;
      filterConds.push(f.op === 'like' ? like(table[f.col], '%' + f.val + '%') : eq(table[f.col], f.val));
    }
  }

  const [{ value: total }] = await db()
    .select({ value: count() })
    .from(table)
    .where(and(...filterConds));

  if (csv) {
    let csvQuery = db()
      .select({
      id: table.id,
      roles: table.roles,
      tenant_id: table.tenant_id,
      username: table.username,
      email: table.email,
      githubId: table.githubId,
      role: table.role,
      retryLimit: table.retryLimit,
      retryCount: table.retryCount,
      retryReset: table.retryReset,
      pnToken: table.pnToken,
      revoked: table.revoked,
      sms: table.sms,
      smsLastSent: table.smsLastSent,
      smsVerified: table.smsVerified,
      telegramId: table.telegramId,
      telegramUsername: table.telegramUsername,
    })
      .from(table);
    if (filterConds.length) csvQuery = csvQuery.where(and(...filterConds));
    if (sorter.length) {
      for (const s of sorter) {
        csvQuery = csvQuery.orderBy(s.order === 'desc' ? desc(table[s.column]) : asc(table[s.column]));
      }
    }
    const csvRows = await csvQuery;
    const parser = new Parser({});
    return res.json({ csv: parser.parse(csvRows) });
  }

  let query = db()
    .select({
      id: table.id,
      roles: table.roles,
      tenant_id: table.tenant_id,
      username: table.username,
      email: table.email,
      githubId: table.githubId,
      role: table.role,
      retryLimit: table.retryLimit,
      retryCount: table.retryCount,
      retryReset: table.retryReset,
      pnToken: table.pnToken,
      revoked: table.revoked,
      sms: table.sms,
      smsLastSent: table.smsLastSent,
      smsVerified: table.smsVerified,
      telegramId: table.telegramId,
      telegramUsername: table.telegramUsername,
    })
    .from(table);
  if (filterConds.length) query = query.where(and(...filterConds));
  if (sorter.length) {
    for (const s of sorter) {
      query = query.orderBy(s.order === 'desc' ? desc(table[s.column]) : asc(table[s.column]));
    }
  }

  const maxPage = Math.ceil(Number(total) / limit);
  const effectivePage = page > maxPage ? Math.max(maxPage, 1) : page;
  let rows = await query
    .limit(limit)
    .offset((effectivePage > 0 ? effectivePage - 1 : 0) * limit);

  rows = rows.map(r => ({ ...r, __key: String(r.id) }));
  return res.json({ results: rows, total: Number(total) });
};

const remove = async (req, res) => {
  const result = await db()
    .delete(table)
    .where(eq(table.id, Number(req.params.id)));
  const count = result.rowCount ?? 0;
  return res.status(count ? 200 : 404).json({ count });
};

const removeBatch = async (req, res) => {
  const { ids }: { ids: string[] } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'No ids provided' });
  const pkValues = ids.map((id: string) => Number(id));
  const result = await db().delete(table).where(inArray(table.id, pkValues));
  return res.json({ deletedRows: result.rowCount ?? ids.length });
};

const autocomplete = async (req, res) => {
  const { key, text, search, limit = 20 } = req.body;
  const conds = [like(table[key], '%' + search + '%'), like(table[text], '%' + search + '%')];
  const rows = await db().select().from(table).where(or(...conds)).limit(Number(limit));
  res.json(rows.map(row => ({
    key: row[key],
    text: row[text],
  })));
};

const upload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const records = csvParse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true });
  const result = await db().insert(table).values(records);
  return res.json({ inserted: result.rowCount ?? records.length });
};

const getConfig = async (_req, res) => {
  const drizzleTable = tableRefMap['users'];
  if (!drizzleTable) return res.json(supplement);
  const merged = mergeWithSupplement('users', drizzleTable as any, supplement);
  const { ref: _ref, db: _db, ...config } = merged as any;
  res.json(config);
};

export default { create, findOne, update, find, remove, removeBatch, autocomplete, upload, getConfig };
