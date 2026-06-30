// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: categories
// ─────────────────────────────────────────────────────────────────────────────
import { authUser as realAuth } from '@common/node/auth/jwt';
import { requireRole } from '@common/node/auth/permit';

// biome-ignore lint/suspicious/noExplicitAny: mock auth for development (same as T4T's index.ts)
const authUser = process.env.NODE_ENV === 'production' ? realAuth : (req: any, _res: any, next: any) => {
  req.user = { sub: 'testuser', roles: ['admin', 'editor', 'viewer'] };
  next();
};
import { validate } from '@common/node/errors/validate';
import express from 'express';
import { memoryUpload } from '@common/node/express/upload';
import supplement from '../t4t-supplement.ts';
import {
  CategoriesBodySchema,
  CategoriesParamsSchema,
  CategoriesQuerySchema,
  CategoriesUpdateSchema,
} from './schema.js';
// Imports from the sidecar controller so developer overrides are picked up automatically.
import categoriesController from '../controller.ts';

export default express
  .Router()
  .get('/config', authUser, categoriesController.getConfig)
  .post('/delete', authUser, requireRole(supplement, 'delete'), categoriesController.removeBatch)
  .post('/upload', authUser, requireRole(supplement, 'import'), memoryUpload().single('file'), categoriesController.upload)
  .post('/autocomplete', authUser, requireRole(supplement, 'view'), categoriesController.autocomplete)
  .post('/', authUser, requireRole(supplement, 'create'), validate('body', CategoriesBodySchema), categoriesController.create)
  .get('/', authUser, requireRole(supplement, 'view'), validate('query', CategoriesQuerySchema), categoriesController.find)
  .get('/:id', authUser, requireRole(supplement, 'view'), validate('params', CategoriesParamsSchema), categoriesController.findOne)
  .patch(
    '/:id',
    authUser,
    requireRole(supplement, 'update'),
    validate('params', CategoriesParamsSchema),
    validate('body', CategoriesUpdateSchema),
    categoriesController.update,
  )
  .delete('/:id', authUser, requireRole(supplement, 'delete'), validate('params', CategoriesParamsSchema), categoriesController.remove);
