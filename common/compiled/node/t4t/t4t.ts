import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, like, or } from 'drizzle-orm';
import type { NextFunction, Response } from 'express';
import express from 'express';
import multer from 'multer';
import { memoryUpload } from '../express/upload.ts';
import * as svc from '../services/index.ts';

const { CONFIGS_FOLDER_PATH, CONFIGS_CSV_SIZE, CONFIGS_UPLOAD_SIZE } = globalThis.__config?.T4T || {};

import base from './t4t-base.ts';
import { noAuthFunc, processJson, roleOperationMatch, tableRefMap } from './t4t-utils.ts';
import type { FileUiConfig, T4TOptions, T4TRequest } from './types.ts';

const uploadMemory = {
  limits: { files: 1, fileSize: Number(CONFIGS_CSV_SIZE) || 500000 },
};

const storageUpload = () => {
  return multer({
    // TODO handle errors of missing properties
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const key = file.fieldname;
        const fileUiConfig = (req as T4TRequest).table.fileConfigUi[key] as FileUiConfig;
        const { folder } = fileUiConfig.multer;
        return cb(null, folder ?? '');
      },
      filename: (_req, file, cb) => cb(null, file.originalname), // file.fieldname, file.originalname
    }),
    fileFilter: (req, file, cb) => {
      // TODO check on individual file size
      const key = file.fieldname;
      const t4tReq = req as T4TRequest;
      const fileUiConfig = t4tReq.table.fileConfigUi[key] as FileUiConfig;
      const { options } = fileUiConfig.multer;
      if (!t4tReq.fileCount) t4tReq.fileCount = {};
      if (!t4tReq.fileCount[key]) t4tReq.fileCount[key] = 0;
      const maxFileLimit = options?.limits?.files || 1;
      if (t4tReq.fileCount[key] >= maxFileLimit) {
        return cb(new Error(`Maximum Number Of Files Exceeded`));
      }
      t4tReq.fileCount[key]++; // Increment the file count for each processed file
      // TODO validate binary file type... using npm file-type?
      // https://dev.to/ayanabilothman/file-type-validation-in-multer-is-not-safe-3h8l
      // if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
      //   return cb(new Error('Invalid file type!'), false)
      // }
      return cb(null, true); // Accept the file
    },
    limits: {
      // files: 3,
      fileSize: Number(CONFIGS_UPLOAD_SIZE) || 8000000, // TODO
    },
  });
};

let roleKey = '';
let idKey = '';
let orgIdKey = '';

// __key is reserved property for identifying row in a table
// | is reserved for seperating columns that make the multiKey
const generateTable = async (req: T4TRequest, _res: Response, next: NextFunction): Promise<void> => {
  const tableKey = req.params.table as string;

  const modPath = `${CONFIGS_FOLDER_PATH}${tableKey}.ts`;
  const absPath = resolve(process.cwd(), modPath);
  const mod = await import(pathToFileURL(absPath).href);
  const doc = mod.default;

  req.table = doc;

  req.table.pk = '';
  req.table.multiKey = [];
  req.table.required = [];
  req.table.auto = [];
  req.table.fileConfigUi = {};

  req.table.ref = tableRefMap[req.table.name] ?? null;
  req.table.db = 'drizzle1';

  // normalise roles — req.user.roles may be string[] (JWT) or comma-string (legacy)
  const userRoles = req.user?.[roleKey];
  const roleStr: string = Array.isArray(userRoles) ? userRoles.join(',') : ((userRoles as string) ?? '');

  // permissions settings
  req.table.view = roleOperationMatch(roleStr, req.table.view);
  const acStr = '/autocomplete';
  const acLen = acStr.length;
  if (req.path.substring(req.path.length - acLen) === acStr) {
    logger.info('auto complete here...');
    return next();
  }
  req.table.create = roleOperationMatch(roleStr, req.table.create);
  req.table.update = roleOperationMatch(roleStr, req.table.update);
  req.table.delete = roleOperationMatch(roleStr, req.table.delete);
  req.table.import = roleOperationMatch(roleStr, req.table.import);
  req.table.export = roleOperationMatch(roleStr, req.table.export);

  // sanitize
  req.table.deleteLimit = Number(req.table.deleteLimit) || -1;

  // can return for autocomplete... req.path
  const cols = req.table.cols;
  for (const key in cols) {
    const col = cols[key];
    if (col.auto) {
      if (col.auto === 'pk') {
        req.table.pk = key;
      } else {
        req.table.auto.push(key);
      }
    }
    if (col.multiKey) req.table.multiKey.push(key);
    if (col.required) req.table.required.push(key);
    if (col?.ui?.tag === 'files') req.table.fileConfigUi[key] = col?.ui;

    col.editor = !(col.editor && !roleOperationMatch(roleStr, col.editor, key));
    if (!col.editor && col.edit) col.edit = 'readonly';
    col.creator = !(col.creator && !roleOperationMatch(roleStr, col.creator, key));
    if (!col.creator && col.add) col.add = 'readonly';
  }
  // logger.info(req.table)
  return next();
};

const routes = (options?: T4TOptions): express.Router => {
  const authUser = options?.authFunc || noAuthFunc;
  roleKey = 'roles';
  idKey = 'sub';
  orgIdKey = 'tenant_id';

  // Build shared table reference map from the Drizzle schema (if provided)
  // Clear and repopulate so both t4t.ts and t4t-base.ts can access it
  for (const k of Object.keys(tableRefMap)) delete tableRefMap[k];
  if (options?.schema) {
    for (const [key, val] of Object.entries(options.schema)) {
      if (
        val &&
        typeof val === 'object' &&
        (val as any)?.constructor?.[Symbol.for('drizzle:entityKind')] === 'PgTable'
      ) {
        tableRefMap[key] = val;
      }
    }
  }

  return express
    .Router()
    .get('/healthcheck', (_req, res) => res.send('t4t ok - 0.0.1'))
    .get('/config/:table', authUser, generateTable, async (req, res) => {
      if (!(req as T4TRequest).table.view) throw new Error('Forbidden - Table Info');
      const t4tReq = req as T4TRequest;
      const { ref: _ref, ...config } = t4tReq.table;
      res.json(config);
    })
    .post('/autocomplete/:table', authUser, generateTable, async (req, res) => {
      const t4tReq = req as T4TRequest;
      const { table } = t4tReq;
      const { key, text, search, parentTableColName, parentTableColVal, limit = 20 } = req.body;
      const db = svc.get(table.conn) as any;
      const ref = table.ref;
      const conds = [like(ref[key], `%${search}%`), like(ref[text], `%${search}%`)];
      if (parentTableColName && parentTableColVal !== undefined) {
        conds.push(eq(ref[parentTableColName], parentTableColVal));
      }
      let rows = await db
        .select()
        .from(ref)
        .where(or(...conds))
        .limit(limit);

      rows = rows.map(row => {
        const textKeys = text?.split(',');
        const texts: { type: string; value: unknown }[] = [];
        for (const tk of textKeys) {
          if (table.cols[tk]) {
            texts.push({
              type: 'string', // table.cols[tk].type || 'string', // should be using dependent table...
              value: row[tk],
            });
          }
        }
        return {
          key: row[key],
          text: texts.length ? texts : [{ type: 'string', value: 'ERROR' }], // text ? row[text] : row[key]
          // text: text ? row[text] : row[key],
        };
      });
      res.json(rows);
    })
    .get('/find/:table', authUser, generateTable, async (req, res) => {
      await base.find(req as T4TRequest, res);
    })
    .get('/find-one/:table', authUser, generateTable, async (req, res) => {
      await base.findOne(req as T4TRequest, res);
    })
    .patch('/update/:table{/:id}', authUser, generateTable, storageUpload().any(), processJson, async (req, res) => {
      await base.update(req as T4TRequest, res);
    })
    .post('/create/:table', authUser, generateTable, storageUpload().any(), processJson, async (req, res) => {
      await base.create(req as T4TRequest, res);
    })
    .post('/remove/:table', authUser, generateTable, async (req, res) => {
      await base.remove(req as T4TRequest, res);
    })
    .post(
      '/upload/:table',
      authUser,
      generateTable,
      memoryUpload(uploadMemory).single('csv-file'),
      async (req, res) => {
        await base.upload(req as T4TRequest, res);
      },
    );

  // delete file
  // export async function deleteFile(filePath) {
  //   fs.unlink(filePath, e => {
  //     if (e) logger.info(e)
  //     else logger.info(filePath +' deleted!')
  //   })
  // }
};

export default routes;
