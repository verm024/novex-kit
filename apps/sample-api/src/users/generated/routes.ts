// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: users
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
  UsersBodySchema,
  UsersParamsSchema,
  UsersQuerySchema,
  UsersUpdateSchema,
} from './schema.js';
// Imports from the sidecar controller so developer overrides are picked up automatically.
import usersController from '../controller.ts';

export default express
  .Router()
  .get('/config', authUser, usersController.getConfig)
  .post('/delete', authUser, requireRole(supplement, 'delete'), usersController.removeBatch)
  .post('/upload', authUser, requireRole(supplement, 'import'), memoryUpload().single('file'), usersController.upload)
  .post('/autocomplete', authUser, requireRole(supplement, 'view'), usersController.autocomplete)
  .post('/', authUser, requireRole(supplement, 'create'), validate('body', UsersBodySchema), usersController.create)
  .get('/', authUser, requireRole(supplement, 'view'), validate('query', UsersQuerySchema), usersController.find)
  .get('/:id', authUser, requireRole(supplement, 'view'), validate('params', UsersParamsSchema), usersController.findOne)
  .patch(
    '/:id',
    authUser,
    requireRole(supplement, 'update'),
    validate('params', UsersParamsSchema),
    validate('body', UsersUpdateSchema),
    usersController.update,
  )
  .delete('/:id', authUser, requireRole(supplement, 'delete'), validate('params', UsersParamsSchema), usersController.remove);
