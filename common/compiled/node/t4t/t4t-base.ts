import { Parser } from '@json2csv/plainjs';
import { parse } from 'csv-parse';
import { and, asc, count, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { Response } from 'express';
import * as svc from '../services/index.ts';
import { isInvalidInput, kvDb2Col, mapRelation, tableRefMap } from './t4t-utils.ts';
import type { T4TRequest } from './types.ts';

const csvParse = parse;

// biome-ignore lint/suspicious/noExplicitAny: drizzle table ref is untyped
const ref = (_t: T4TRequest['table']) => _t.ref as any;

const upload = async (req: T4TRequest, res: Response): Promise<void> => {
  logger.info('base upload');
  const { table } = req;
  if (!table.import) throw new Error('Forbidden - Upload');
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const csv = req.file.buffer.toString('utf-8');
  const output: string[][] = [];
  const errors: string[] = [];
  let keys: string[] = [];
  let line = 0;
  let columnsError = false;
  const keyMap: Record<string, boolean> = {};
  const db = svc.get(table.conn) as any;
  csvParse(csv)
    .on('error', e => logger.error(e.message))
    .on('readable', function () {
      let record = this.read() as string[] | null;
      while (record) {
        line++;
        if (line === 1) {
          keys = [...record];
          keys.forEach(key => {
            keyMap[key] = true;
          });
          for (const k in table.cols) {
            if (
              (table.cols[k].required && !keyMap[k]) ||
              (keyMap[k] && table.cols[k].type === 'link') ||
              (keyMap[k] && table.cols[k].auto)
            ) {
              errors.push(`-1,Fatal Error: missing required column/s or invalid column/s`);
              columnsError = true;
              break;
            }
          }
          continue;
        }
        if (!columnsError) {
          if (record.length === keys.length) {
            if (record.join('')) output.push(record);
            else errors.push(`${line},Empty Row`);
          } else errors.push(`${line},Column Count Mismatch`);
        }
        record = this.read() as string[] | null;
      }
    })
    .on('end', async () => {
      let _line = 0;
      const writes: Promise<unknown>[] = [];
      const tr = ref(table);
      for (const row of output) {
        _line++;
        try {
          const obj: Record<string, string> = {};
          for (let i = 0; i < keys.length; i++) obj[keys[i]] = row[i];
          writes.push(db.insert(tr).values(obj));
        } catch (e) {
          errors.push(`L2-${_line},Caught exception: ${String(e)}`);
        }
      }
      try {
        if (writes.length) {
          const rv = await Promise.allSettled(writes);
          rv.forEach((result, index) => {
            if (result.status !== 'fulfilled') errors.push(`L3-${index + 1},${result.reason}`);
          });
        }
      } catch (e) {
        errors.push(`-2,General write error: ${String(e)}`);
      }
      return void res.status(200).json({ errorCount: errors.length, errors });
    });
};

const find = async (req: T4TRequest, res: Response): Promise<void> => {
  if (!req.table.view) throw new Error('Forbidden - List All');
  const { table } = req;
  const rawQuery = req.query as { page?: string; limit?: string; filters?: string; sorter?: string; csv?: string };
  let page = parseInt(rawQuery.page ?? '1');
  const limit = parseInt(rawQuery.limit ?? '25');
  const filters: { col: string; op: string; val: unknown; andOr?: string }[] | null = JSON.parse(
    rawQuery.filters || 'null',
  );
  let sorter: unknown[] = JSON.parse(rawQuery.sorter || '[]');
  const csv = rawQuery.csv ?? '';
  if (req.table?.defaultSort && sorter.length === 0 && req.table.defaultSort.length > 0) {
    sorter = req.table.defaultSort;
  }
  if (page < 1) page = 1;
  const rv: { results: Record<string, unknown>[]; total: number } = { results: [], total: 0 };
  const db = svc.get(table.conn) as any;
  const tr = ref(table);
  const baseQuery = db.select().from(tr);

  // Build filter conditions once
  const filterConds: any[] = [];
  if (filters?.length) {
    for (const filter of filters) {
      const op = filter.op;
      const value = op === 'like' ? `%${filter.val}%` : filter.val;
      if (!tr[filter.col]) continue;
      filterConds.push(op === 'like' ? sql`${tr[filter.col]} LIKE ${value}` : sql`${tr[filter.col]} = ${value}`);
    }
  }

  // Count filtered rows (no joins, no pagination)
  let countQ = db.select({ value: count() }).from(tr);
  if (filterConds.length) countQ = countQ.where(and(...filterConds));
  const [{ value: totalVal }] = await countQ;
  rv.total = Number(totalVal);
  const maxPage = Math.ceil(rv.total / limit);
  if (page > maxPage) page = maxPage;

  // Main query with joins, filters, sorting, pagination
  let query = baseQuery;
  const selectFields: Record<string, unknown> = {};
  const joinCols: Record<string, string> = {};
  for (const key in table.cols) {
    const rel = mapRelation(key, table.cols[key]);
    if (rel) {
      const { table2, table2Id, table2Text, table1Id } = rel;
      const ref2 = tableRefMap?.[table2];
      if (ref2) {
        query = query.leftJoin(ref2, eq(tr[table1Id], ref2[table2Id]));
        const joinCol = `${table1Id}_${table2Text}`;
        joinCols[table1Id] = joinCol;
        selectFields[joinCol] = ref2[table2Text];
      }
    }
  }
  if (Object.keys(selectFields).length) query = query.select({ ...tr, ...selectFields });

  if (filterConds.length) query = query.where(and(...filterConds));
  if (sorter?.length) {
    for (const s of sorter as Array<Record<string, string>>) {
      const col = tr[s.column];
      if (col) query = query.orderBy(s.order === 'desc' ? desc(col) : asc(col));
    }
  }

  // CSV: export ALL matching rows (no pagination)
  if (csv) {
    const csvRows = await query;
    const parser = new Parser({});
    return void res.json({ csv: parser.parse(csvRows.map(row => kvDb2Col(row, joinCols, table.cols))) });
  }

  // Paginate or return all
  if (limit > 0) query = query.limit(limit).offset((page > 0 ? page - 1 : 0) * limit);
  let rows = await query;
  rows = rows.map(row => kvDb2Col(row, joinCols, table.cols));

  rv.results = rows.map(row => {
    if (table.pk) row.__key = row[table.pk];
    else {
      const val: unknown[] = [];
      for (const k of table.multiKey) val.push(row[k]);
      row.__key = val.join('|');
    }
    return row;
  });
  return void res.json(rv);
};

const findOne = async (req: T4TRequest, res: Response): Promise<void> => {
  if (!req.table.view) throw new Error('Forbidden - List One');
  const { table } = req;
  const __key = req.query.__key as string;
  if (!__key) return void res.status(400).json({});
  const db = svc.get(table.conn) as any;
  const tr = ref(table);
  let query = db.select().from(tr);

  if (table.pk) {
    query = query.where(eq(tr[table.pk], __key));
  } else if (table.multiKey?.length) {
    const parts = __key.split('|');
    query = query.where(and(...table.multiKey.map((k, i) => eq(tr[k], parts[i]))));
  }

  query = query.limit(1);
  const selectFields: Record<string, unknown> = {};
  const joinCols: Record<string, string> = {};
  for (const key in table.cols) {
    const rel = mapRelation(key, table.cols[key]);
    if (rel) {
      const { table2, table2Id, table2Text, table1Id } = rel;
      const ref2 = tableRefMap?.[table2];
      if (ref2) {
        query = query.leftJoin(ref2, eq(tr[table1Id], ref2[table2Id]));
        const joinCol = `${table1Id}_${table2Text}`;
        joinCols[table1Id] = joinCol;
        selectFields[joinCol] = ref2[table2Text];
      }
    }
  }
  if (Object.keys(selectFields).length) query = query.select({ ...tr, ...selectFields });

  const [rv] = await query;
  return void res.status(rv ? 200 : 404).json(rv ? kvDb2Col(rv, joinCols, table.cols) : null);
};

const remove = async (req: T4TRequest, res: Response): Promise<void> => {
  if (!req.table.delete) throw new Error('Forbidden - Delete');
  const { table } = req;
  const { ids }: { ids: string[] } = req.body;
  if (table.deleteLimit > 0 && ids.length > table.deleteLimit)
    return void res.status(400).json({ error: `Select up to ${table.deleteLimit} items` });
  if (ids.length < 1) return void res.status(400).json({ error: 'No item selected' });

  const db = svc.get(table.conn) as any;
  const tr = ref(table);
  await db.transaction(async (tx: any) => {
    if (table.pk || table.multiKey.length === 1) {
      const keyCol = table.pk || table.multiKey[0];
      await tx.delete(tr).where(inArray(tr[keyCol], ids));
    } else {
      for (const id of ids) {
        const parts = id.split('|');
        await tx.delete(tr).where(and(...table.multiKey.map((k, i) => eq(tr[k], parts[i]))));
      }
    }
  });
  return void res.json({ deletedRows: ids.length });
};

const update = async (req: T4TRequest, res: Response): Promise<void> => {
  if (!req.table.update) throw new Error('Forbidden - Update');
  const { body, table } = req;
  const __key = req.query.__key as string;
  if (!__key) return void res.status(400).json({});

  for (const key in table.cols) {
    if (body[key] !== undefined) {
      const col = table.cols[key];
      if (!col.editor) delete body[key];
      else if (col.edit !== true) delete body[key];
      else if (col?.hide === 'blank' && !body[key]) delete body[key];
      else {
        const invalid = isInvalidInput(col, body[key], key);
        if (invalid) return void res.status(400).json(invalid);
        if (col.auto && col.auto === 'user') body[key] = req?.user?.sub || 'unknown';
        else if (col.auto && col.auto === 'ts') body[key] = new Date().toISOString();
        else {
          body[key] = ['integer', 'decimal'].includes(col.type ?? '')
            ? Number(body[key])
            : ['datetime', 'date', 'time'].includes(col.type ?? '')
              ? body[key]
                ? new Date(body[key])
                : null
              : body[key];
        }
      }
    }
  }

  const db = svc.get(table.conn) as any;
  const tr = ref(table);
  let count = 0;
  await db.transaction(async (tx: any) => {
    if (table.pk) {
      const rows = await tx.update(tr).set(body).where(eq(tr[table.pk], __key)).returning();
      count = rows.length;
    } else if (table.multiKey?.length) {
      const parts = __key.split('|');
      const rows = await tx
        .update(tr)
        .set(body)
        .where(and(...table.multiKey.map((k, i) => eq(tr[k], parts[i]))))
        .returning();
      count = rows.length;
    }
  });
  return void res.json({ count });
};

const create = async (req: T4TRequest, res: Response): Promise<void> => {
  if (!req.table.create) throw new Error('Forbidden - Create');
  const { table, body } = req;
  for (const key in table.cols) {
    const col = table.cols[key];
    if (!col.creator) delete body[key];
    else if (col.add !== true) delete body[key];
    else if (col.auto && col.auto === 'pk' && key in body) delete body[key];
    else {
      const invalid = isInvalidInput(col, body[key], key);
      if (invalid) return void res.status(400).json(invalid);
      if (col.auto && col.auto === 'user') body[key] = req?.user?.sub || 'unknown';
      else if (col.auto && col.auto === 'ts') body[key] = new Date().toISOString();
      else {
        body[key] = ['integer', 'decimal'].includes(table.cols[key].type ?? '')
          ? Number(body[key])
          : ['datetime', 'date', 'time'].includes(table.cols[key].type ?? '')
            ? body[key]
              ? new Date(body[key])
              : null
            : body[key];
      }
    }
  }

  const db = svc.get(table.conn) as any;
  const tr = ref(table);
  let rv;
  await db.transaction(async (tx: any) => {
    let q = tx.insert(tr).values(body);
    if (table.pk) q = q.returning({ [table.pk]: tr[table.pk] });
    rv = await q;
  });
  return void res.status(201).json(rv);
};

export default {
  upload,
  find,
  findOne,
  remove,
  update,
  create,
};
