// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: iamUsers
// ─────────────────────────────────────────────────────────────────────────────
import { authUser } from '@common/node/auth/jwt';
import { requireRole } from '@common/node/auth/permit';
import { validate } from '@common/node/errors/validate';
import express from 'express';
import { memoryUpload } from '@common/node/express/upload';
import supplement from '../t4t-supplement.ts';
import {
  IamUsersBodySchema,
  IamUsersParamsSchema,
  IamUsersQuerySchema,
  IamUsersUpdateSchema,
} from './schema.js';
// Imports from the sidecar controller so developer overrides are picked up automatically.
import iamUsersController from '../controller.ts';

export default express
  .Router()
  .get('/config', authUser, iamUsersController.getConfig)
  .post('/delete', authUser, requireRole(supplement, 'delete'), iamUsersController.removeBatch)
  .post('/upload', authUser, requireRole(supplement, 'import'), memoryUpload().single('file'), iamUsersController.upload)
  .post('/autocomplete', authUser, requireRole(supplement, 'view'), iamUsersController.autocomplete)
  .post('/', authUser, requireRole(supplement, 'create'), validate('body', IamUsersBodySchema), iamUsersController.create)
  .get('/', authUser, requireRole(supplement, 'view'), validate('query', IamUsersQuerySchema), iamUsersController.find)
  .get('/:id', authUser, requireRole(supplement, 'view'), validate('params', IamUsersParamsSchema), iamUsersController.findOne)
  .patch(
    '/:id',
    authUser,
    requireRole(supplement, 'update'),
    validate('params', IamUsersParamsSchema),
    validate('body', IamUsersUpdateSchema),
    iamUsersController.update,
  )
  .delete('/:id', authUser, requireRole(supplement, 'delete'), validate('params', IamUsersParamsSchema), iamUsersController.remove);
