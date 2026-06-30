// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED — DO NOT EDIT
// Re-run `npm run generate:crud` to regenerate this file.
// Source table: roles
// ─────────────────────────────────────────────────────────────────────────────
import { authUser } from '@common/node/auth/jwt';
import { requireRole } from '@common/node/auth/permit';
import { validate } from '@common/node/errors/validate';
import express from 'express';
import { memoryUpload } from '@common/node/express/upload';
import supplement from '../t4t-supplement.ts';
import {
  RolesBodySchema,
  RolesParamsSchema,
  RolesQuerySchema,
  RolesUpdateSchema,
} from './schema.js';
// Imports from the sidecar controller so developer overrides are picked up automatically.
import rolesController from '../controller.ts';

export default express
  .Router()
  .get('/config', authUser, rolesController.getConfig)
  .post('/delete', authUser, requireRole(supplement, 'delete'), rolesController.removeBatch)
  .post('/upload', authUser, requireRole(supplement, 'import'), memoryUpload().single('file'), rolesController.upload)
  .post('/autocomplete', authUser, requireRole(supplement, 'view'), rolesController.autocomplete)
  .post('/', authUser, requireRole(supplement, 'create'), validate('body', RolesBodySchema), rolesController.create)
  .get('/', authUser, requireRole(supplement, 'view'), validate('query', RolesQuerySchema), rolesController.find)
  .get('/:id', authUser, requireRole(supplement, 'view'), validate('params', RolesParamsSchema), rolesController.findOne)
  .patch(
    '/:id',
    authUser,
    requireRole(supplement, 'update'),
    validate('params', RolesParamsSchema),
    validate('body', RolesUpdateSchema),
    rolesController.update,
  )
  .delete('/:id', authUser, requireRole(supplement, 'delete'), validate('params', RolesParamsSchema), rolesController.remove);
